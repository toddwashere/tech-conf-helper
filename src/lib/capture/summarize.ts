import { z } from "zod";
import { DEFAULT_CONFERENCE } from "@/lib/conference";
import { getEs } from "@/lib/es/client";
import type { SessionSummary, SummarizeResult } from "@/lib/types";
import type { QueryTrace } from "@/components/query-inspector";
import { extractiveSummary } from "./extractive";
import { getSummaryMemory, listSessionMemories, saveSummaryMemory } from "./memories";
import { runWorkflowAndWait } from "./workflows";
import { SUMMARY_SYSTEM_PROMPT, summaryUserPrompt } from "./prompts";
import { getSessionById } from "./session";

const MODEL = process.env.OPENAI_MODEL ?? "gpt-4o-mini";
// Keep the prompt bounded; a 30-minute talk is ~4,500 words.
const MAX_TRANSCRIPT_CHARS = 40_000;

export const summarySchema = z.object({
  one_line: z.string().min(1).max(400),
  takeaways: z.array(z.string().min(1).max(400)).min(1).max(8),
  action_items: z.array(z.string().min(1).max(400)).max(8),
});

export function summaryToText(s: SessionSummary): string {
  const lines = [s.one_line, "", "Takeaways:", ...s.takeaways.map((t) => `- ${t}`)];
  if (s.action_items.length) lines.push("", "Action items:", ...s.action_items.map((a) => `- ${a}`));
  return lines.join("\n");
}

export function summaryMemoryId(sessionId: string): string {
  return `${DEFAULT_CONFERENCE.id}:summary:${sessionId.replace(/[^\w:.-]/g, "_")}`;
}

async function callOpenAi(apiKey: string, user: string): Promise<unknown> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SUMMARY_SYSTEM_PROMPT },
        { role: "user", content: user },
      ],
    }),
  });
  if (!res.ok) throw new Error(`OpenAI returned ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  return JSON.parse(body.choices?.[0]?.message?.content ?? "null");
}

/** Parses the summary shape the app and the `session-ended` workflow both write (lists as JSON strings). */
export function summaryFromMetadata(md: Record<string, string> | null | undefined): SessionSummary | null {
  if (!md) return null;
  try {
    const parsed = summarySchema.safeParse({
      one_line: md.one_line,
      takeaways: JSON.parse(md.takeaways ?? "[]"),
      action_items: JSON.parse(md.action_items ?? "[]"),
    });
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export type SummarizeResponse = SummarizeResult & { trace?: QueryTrace[] };

const NO_KEY_NOTICE = "No AI key, so Elasticsearch picked these from your captions and notes. Add OPENAI_API_KEY for a written summary.";

async function aiSummary(apiKey: string, user: string): Promise<SessionSummary | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const parsed = summarySchema.safeParse(await callOpenAi(apiKey, user));
      if (parsed.success) return parsed.data;
      console.warn("[summarize] invalid model output, attempt", attempt + 1, parsed.error.issues);
    } catch (error) {
      console.error("[summarize] model call failed", error);
    }
  }
  return null;
}

/**
 * The one entry point for session summaries: read transcript + notes from ES, summarize, and write a `summary`
 * memory. With OPENAI_API_KEY it asks the model (zod-validated); without one, or if the model fails, it builds
 * "Highlights (no AI)" with Elasticsearch ranking alone. WS-C may swap the AI body for an Elastic Workflow call;
 * callers only depend on this signature.
 */
export async function summarizeSession(sessionId: string): Promise<SummarizeResponse> {
  const es = getEs();
  const session = await getSessionById(es, sessionId);
  if (!session) return { status: "error", message: "We couldn't find that session." };

  const memories = await listSessionMemories(es, sessionId, ["transcript", "note"]);
  const transcriptChunks = memories.filter((m) => m.type === "transcript");
  const noteDocs = memories.filter((m) => m.type === "note");
  const notes = noteDocs.map((m) => m.text);
  if (!transcriptChunks.length && !notes.length) {
    return { status: "empty", message: "Nothing to summarize yet. Start captions or add a note first." };
  }

  const memoryId = summaryMemoryId(sessionId);
  let trace: QueryTrace[] = [];

  // 1. Elastic Workflow `session-ended`: reads these memories in ES, summarizes with the Elastic Managed LLM, and
  //    upserts the same summary doc this function writes. We wait for it, then read the result back.
  if (process.env.SUMMARY_WORKFLOW !== "off") {
    const run = await runWorkflowAndWait("session-ended", { session_id: sessionId });
    trace.push(run.trace);
    if (run.ok) {
      const written = await getSummaryMemory(es, memoryId);
      const parsed = written?.source === "workflow:session-ended" ? summaryFromMetadata(written.metadata) : null;
      if (parsed) {
        return { status: "ok", summary: parsed, memoryId, transcriptChunks: transcriptChunks.length, notes: notes.length, mode: "workflow", notice: null, trace };
      }
      console.warn("[summarize] workflow completed but its summary was unreadable", written?.metadata);
    } else {
      console.warn("[summarize] session-ended workflow failed", run.status, run.error);
    }
  }

  // 2. OpenAI directly, only when a key is set. 3. Otherwise extractive highlights from Elasticsearch alone.
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  let summary: SessionSummary | null = null;
  let mode: "ai" | "extractive" = "ai";
  let notice: string | null = null;

  if (apiKey) {
    const transcript = transcriptChunks.map((c) => c.text).join(" ").slice(-MAX_TRANSCRIPT_CHARS);
    summary = await aiSummary(apiKey, summaryUserPrompt({ title: session.title, abstract: session.description, transcript, notes }));
    if (!summary) notice = "The AI summary failed, so Elasticsearch picked these highlights instead.";
  } else {
    notice = NO_KEY_NOTICE;
  }
  if (!summary) {
    const extractive = await extractiveSummary(es, session, transcriptChunks.length, noteDocs);
    summary = extractive.summary;
    trace = [...trace, ...extractive.trace];
    mode = "extractive";
    if (trace.some((t) => t.label.startsWith("Elastic Workflow"))) {
      notice = "The Elastic Workflow couldn't summarize right now, so Elasticsearch picked these highlights instead.";
    }
  }

  await saveSummaryMemory(es, {
    id: memoryId,
    type: "summary",
    conference: DEFAULT_CONFERENCE.id,
    session_id: sessionId,
    source: mode === "ai" ? `openai:${MODEL}` : "extractive",
    title: `${mode === "ai" ? "Summary" : "Highlights"}: ${session.title}`,
    text: summaryToText(summary),
    lang: "en",
    starts_at_ms: null,
    metadata: {
      mode,
      one_line: summary.one_line,
      takeaways: JSON.stringify(summary.takeaways),
      action_items: JSON.stringify(summary.action_items),
    },
    created_at: new Date().toISOString(),
  });
  return { status: "ok", summary, memoryId, transcriptChunks: transcriptChunks.length, notes: notes.length, mode, notice, trace };
}
