import { z } from "zod";
import { getEs } from "@/lib/es/client";
import { INDEX } from "@/lib/es/indices";
import type { SessionDoc, TripReport, TripReportAi } from "@/lib/types";
import { listConferenceMemories } from "./memories";
import { TRIP_REPORT_SYSTEM_PROMPT, tripReportUserPrompt } from "./prompts";
import { groupTripReport, type SessionInfo } from "./trip-report-group";

const MODEL = process.env.OPENAI_MODEL ?? "gpt-4o-mini";
const MAX_PROMPT_CHARS = 60_000;

const aiSchema = z.object({
  headline: z.string().min(1).max(400),
  highlights: z.array(z.string().min(1).max(400)).max(8),
  top_talks: z.array(z.object({ session_id: z.string(), why: z.string().max(400) })).max(5),
  follow_ups: z.array(z.string().min(1).max(400)).max(10),
  next_steps: z.array(z.string().min(1).max(400)).max(8),
});

async function loadSessions(ids: string[]): Promise<Map<string, SessionInfo>> {
  const map = new Map<string, SessionInfo>();
  if (!ids.length) return map;
  const res = await getEs().mget<SessionDoc>({
    index: INDEX.sessions,
    ids,
    _source_includes: ["id", "title", "starts_at", "room", "day"],
  });
  for (const d of res.docs) {
    if ("found" in d && d.found && d._source) {
      const s = d._source;
      map.set(d._id, { id: d._id, title: s.title, starts_at: s.starts_at, room: s.room ?? null, day: s.day });
    }
  }
  return map;
}

async function callOpenAi(apiKey: string, user: string): Promise<unknown> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.3,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: TRIP_REPORT_SYSTEM_PROMPT },
        { role: "user", content: user },
      ],
    }),
  });
  if (!res.ok) throw new Error(`OpenAI returned ${res.status}`);
  const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  return JSON.parse(body.choices?.[0]?.message?.content ?? "null");
}

/**
 * The one entry point for trip reports. Always returns the plain grouped view from `memories`; with `withAi` and an
 * OPENAI_API_KEY it adds a validated narrative on top. WS-C may route the AI part to an Elastic Workflow later.
 */
export async function generateTripReport({ withAi }: { withAi: boolean }): Promise<TripReport> {
  const memories = await listConferenceMemories(getEs(), ["summary", "note", "rating", "contact"]);
  const ids = [...new Set(memories.flatMap((m) => (m.session_id ? [m.session_id] : [])))];
  const sessions = await loadSessions(ids);
  const grouped = groupTripReport(memories, sessions);
  const report: TripReport = { ...grouped, ai: null, aiStatus: "skipped", aiMessage: null };
  if (!withAi) return report;

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return {
      ...report,
      aiStatus: "missing_key",
      aiMessage: "The written report needs an OpenAI key. Add OPENAI_API_KEY to .env.local and restart. Your grouped report is below.",
    };
  }
  if (!grouped.counts.sessions) {
    return { ...report, aiStatus: "error", aiMessage: "Nothing captured yet. Add notes, ratings, or summaries first." };
  }

  const titles = new Map(grouped.days.flatMap((d) => d.sessions.map((s) => [s.id, s.title] as const)));
  const user = tripReportUserPrompt(grouped.days).slice(0, MAX_PROMPT_CHARS);
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const parsed = aiSchema.safeParse(await callOpenAi(apiKey, user));
      if (!parsed.success) {
        console.warn("[trip-report] invalid model output", parsed.error.issues);
        continue;
      }
      const ai: TripReportAi = {
        ...parsed.data,
        // The model may only cite talks we gave it.
        top_talks: parsed.data.top_talks.flatMap((t) =>
          titles.has(t.session_id) ? [{ session_id: t.session_id, title: titles.get(t.session_id)!, why: t.why }] : [],
        ),
      };
      return { ...report, ai, aiStatus: "ok" };
    } catch (error) {
      console.error("[trip-report] model call failed", error);
    }
  }
  return { ...report, aiStatus: "error", aiMessage: "The written report failed. Your grouped report is below; try again." };
}
