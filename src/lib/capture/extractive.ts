import type { Client, estypes } from "@elastic/elasticsearch";
import type { QueryTrace } from "@/components/query-inspector";
import { INDEX, INFERENCE_ID } from "@/lib/es/indices";
import type { MemoryDoc, SessionDoc, SessionSummary } from "@/lib/types";
import { extractActionItems } from "./action-items";
import { splitSentences } from "./replay";

const MAX_HIGHLIGHTS = 4;
const QUERY_CHARS = 1500;

export interface ExtractiveResult {
  summary: SessionSummary;
  transcriptChunks: number;
  trace: QueryTrace[];
}

/** Keep a highlight readable on a slide: at most two sentences. */
export function trimHighlight(text: string): string {
  return splitSentences(text).slice(0, 2).join(" ");
}

export function buildExtractiveRequest(sessionId: string, abstract: string, notes: string[]): estypes.SearchRequest {
  const filter = [{ term: { session_id: sessionId } }, { term: { type: "transcript" } }];
  const semantic = (query: string): estypes.RetrieverContainer => ({
    standard: { query: { bool: { must: { semantic: { field: "content", query: query.slice(0, QUERY_CHARS) } }, filter } } },
  });
  const retrievers = [semantic(abstract)];
  // Your own notes are the strongest signal of what mattered to you, so they get their own ranked list in the fusion.
  if (notes.length) retrievers.push(semantic(notes.join("\n")));
  return {
    index: INDEX.memories,
    size: MAX_HIGHLIGHTS,
    retriever: retrievers.length > 1 ? { rrf: { retrievers, rank_window_size: 50 } } : retrievers[0],
    _source: ["text", "starts_at_ms"],
  };
}

/**
 * Summary without a model: Elasticsearch ranks this session's transcript chunks by semantic similarity to the talk's
 * abstract and to your notes (RRF), we keep the top few in talk order, and action items come from to-do-style notes.
 */
export async function extractiveSummary(
  es: Client,
  session: Pick<SessionDoc, "id" | "title" | "description">,
  transcriptCount: number,
  notes: MemoryDoc[],
): Promise<ExtractiveResult> {
  const trace: QueryTrace[] = [];
  const noteTexts = notes.map((n) => n.text);
  let highlights: string[] = [];

  if (transcriptCount > 0) {
    const request = buildExtractiveRequest(session.id, `${session.title}\n${session.description}`, noteTexts);
    const res = await es.search<Pick<MemoryDoc, "text" | "starts_at_ms">>(request);
    trace.push({
      label: "Most representative moments: transcript chunks closest to the abstract and to your notes",
      features: noteTexts.length ? ["RRF", "semantic_text", INFERENCE_ID.includes("elser") ? "ELSER" : INFERENCE_ID] : ["semantic_text"],
      index: INDEX.memories,
      request,
      tookMs: res.took,
    });
    highlights = res.hits.hits
      .flatMap((h) => (h._source ? [h._source] : []))
      .sort((a, b) => (a.starts_at_ms ?? 0) - (b.starts_at_ms ?? 0))
      .map((c) => trimHighlight(c.text))
      .filter(Boolean);
  }

  const actions = extractActionItems(noteTexts);
  // Notes that aren't to-dos are still things you chose to write down; use them when there's no transcript.
  const plainNotes = noteTexts.filter((n) => !extractActionItems([n]).length);
  const takeaways = highlights.length ? highlights : plainNotes.slice(0, MAX_HIGHLIGHTS);

  const parts = [transcriptCount && `${transcriptCount} caption chunks`, notes.length && `${notes.length} notes`].filter(Boolean);
  return {
    summary: {
      one_line: `Highlights (no AI) from ${parts.join(" and ") || "what you captured"} in “${session.title}”.`,
      takeaways: takeaways.length ? takeaways : ["Nothing representative yet. Capture captions or add notes, then try again."],
      action_items: actions,
    },
    transcriptChunks: transcriptCount,
    trace,
  };
}
