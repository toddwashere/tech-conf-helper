import { z } from "zod";
import { DEFAULT_CONFERENCE } from "@/lib/conference";
import { getEs } from "@/lib/es/client";
import type { SessionSummary, SummarizeResult } from "@/lib/types";
import { listSessionMemories, saveSummaryMemory } from "./memories";
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

/**
 * The one entry point for session summaries: read transcript + notes from ES, ask the model, validate, and write a
 * `summary` memory. WS-C may swap the body for an Elastic Workflow call; callers only depend on this signature.
 */
export async function summarizeSession(sessionId: string): Promise<SummarizeResult> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return {
      status: "missing_key",
      message: "Summaries need an OpenAI key. Add OPENAI_API_KEY to .env.local and restart the dev server.",
    };
  }

  const es = getEs();
  const session = await getSessionById(es, sessionId);
  if (!session) return { status: "error", message: "We couldn't find that session." };

  const memories = await listSessionMemories(es, sessionId, ["transcript", "note"]);
  const transcriptChunks = memories.filter((m) => m.type === "transcript");
  const notes = memories.filter((m) => m.type === "note").map((m) => m.text);
  if (!transcriptChunks.length && !notes.length) {
    return { status: "empty", message: "Nothing to summarize yet. Start captions or add a note first." };
  }

  const transcript = transcriptChunks.map((c) => c.text).join(" ").slice(-MAX_TRANSCRIPT_CHARS);
  const user = summaryUserPrompt({ title: session.title, abstract: session.description, transcript, notes });

  let summary: SessionSummary | null = null;
  for (let attempt = 0; attempt < 2 && !summary; attempt++) {
    try {
      const parsed = summarySchema.safeParse(await callOpenAi(apiKey, user));
      if (parsed.success) summary = parsed.data;
      else console.warn("[summarize] invalid model output, attempt", attempt + 1, parsed.error.issues);
    } catch (error) {
      console.error("[summarize] model call failed", error);
      if (attempt === 1) return { status: "error", message: "The summary model is unavailable right now. Try again." };
    }
  }
  if (!summary) return { status: "error", message: "The model returned an unusable summary twice. Try again." };

  const memoryId = summaryMemoryId(sessionId);
  await saveSummaryMemory(es, {
    id: memoryId,
    type: "summary",
    conference: DEFAULT_CONFERENCE.id,
    session_id: sessionId,
    source: `openai:${MODEL}`,
    title: `Summary: ${session.title}`,
    text: summaryToText(summary),
    lang: "en",
    starts_at_ms: null,
    metadata: {
      one_line: summary.one_line,
      takeaways: JSON.stringify(summary.takeaways),
      action_items: JSON.stringify(summary.action_items),
    },
    created_at: new Date().toISOString(),
  });
  return { status: "ok", summary, memoryId, transcriptChunks: transcriptChunks.length, notes: notes.length };
}
