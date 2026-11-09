import type { Client, estypes } from "@elastic/elasticsearch";
import type { QueryTrace } from "@/components/query-inspector";
import { DEFAULT_CONFERENCE } from "@/lib/conference";
import { INDEX, INFERENCE_ID } from "@/lib/es/indices";
import type { MemoryDoc, MemoryType, SessionDoc } from "@/lib/types";
import { localToZonedIso } from "@/lib/time";

export const SEARCHABLE_TYPES = ["note", "transcript", "summary", "rating", "contact"] as const satisfies readonly MemoryType[];
export type SearchableType = (typeof SEARCHABLE_TYPES)[number];

export interface MemorySessionRef {
  id: string;
  title: string;
  starts_at: string;
  day: string;
  room: string | null;
}

export interface MemoryHit {
  memory: MemoryDoc;
  score: number | null;
  /** Best-matching passage: semantic highlight of `content`, else keyword highlight of `text`. */
  highlight: string | null;
  session: MemorySessionRef | null;
}

export interface MemorySearchResult {
  total: number;
  hits: MemoryHit[];
  trace: QueryTrace[];
}

const MEMORY_SOURCE = { excludes: ["content"] };
const EMBEDDING_CHIP = INFERENCE_ID.includes("elser") ? "ELSER" : INFERENCE_ID;

/** Next calendar day, for a [day, nextDay) Mountain-time range. */
function nextDay(day: string): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Memories belong to a day through their session (a talk on Wednesday you noted on Wednesday), or, for loose
 * memories with no session, through when they were written. So the day filter is: session on that day OR
 * (no session AND created that day in Mountain time).
 */
export function buildDayFilter(day: string, sessionIdsOnDay: string[]): estypes.QueryDslQueryContainer {
  return {
    bool: {
      should: [
        { terms: { session_id: sessionIdsOnDay } },
        {
          bool: {
            must_not: { exists: { field: "session_id" } },
            filter: {
              range: {
                created_at: { gte: localToZonedIso(`${day}T00:00:00`), lt: localToZonedIso(`${nextDay(day)}T00:00:00`) },
              },
            },
          },
        },
      ],
      minimum_should_match: 1,
    },
  };
}

export function buildMemorySearchRequest(
  query: string,
  filter: estypes.QueryDslQueryContainer[],
  size: number,
): estypes.SearchRequest {
  const q = query.trim();
  if (!q) {
    return {
      index: INDEX.memories,
      size,
      query: { bool: { filter } },
      sort: [{ created_at: "desc" }],
      _source: MEMORY_SOURCE,
    };
  }
  return {
    index: INDEX.memories,
    size,
    retriever: {
      rrf: {
        retrievers: [
          { standard: { query: { bool: { must: { multi_match: { query: q, fields: ["title^2", "text"] } }, filter } } } },
          { standard: { query: { bool: { must: { semantic: { field: "content", query: q } }, filter } } } },
        ],
        rank_window_size: 50,
      },
    },
    highlight: {
      fields: {
        content: { type: "semantic", number_of_fragments: 1 },
        text: { number_of_fragments: 1, fragment_size: 200, pre_tags: [""], post_tags: [""] },
      },
    },
    _source: MEMORY_SOURCE,
  };
}

async function sessionsOnDay(es: Client, day: string, trace: QueryTrace[]): Promise<string[]> {
  const request = {
    index: INDEX.sessions,
    size: 1000,
    _source: false,
    query: { bool: { filter: [{ term: { conference: DEFAULT_CONFERENCE.id } }, { term: { day } }] } },
  } satisfies estypes.SearchRequest;
  const res = await es.search(request);
  trace.push({ label: `Sessions on ${day} (for the day filter)`, features: ["term filter"], index: INDEX.sessions, request, tookMs: res.took });
  return res.hits.hits.flatMap((h) => (h._id ? [h._id] : []));
}

async function lookupSessions(es: Client, ids: string[], trace: QueryTrace[]): Promise<Map<string, MemorySessionRef>> {
  const map = new Map<string, MemorySessionRef>();
  if (!ids.length) return map;
  const request = { index: INDEX.sessions, ids, _source_includes: ["title", "starts_at", "day", "room"] };
  const started = Date.now();
  const res = await es.mget<SessionDoc>(request);
  trace.push({ label: "Look up the sessions these memories belong to", features: ["mget"], index: INDEX.sessions, request, tookMs: Date.now() - started });
  for (const d of res.docs) {
    if ("found" in d && d.found && d._source) {
      map.set(d._id, { id: d._id, title: d._source.title, starts_at: d._source.starts_at, day: d._source.day, room: d._source.room ?? null });
    }
  }
  return map;
}

async function runMemorySearch(
  es: Client,
  request: estypes.SearchRequest,
  label: string,
  features: string[],
  trace: QueryTrace[],
): Promise<{ total: number; hits: MemoryHit[] }> {
  const res = await es.search<MemoryDoc>(request);
  trace.push({ label, features, index: INDEX.memories, request, tookMs: res.took });
  const raw = res.hits.hits.filter((h) => h._source);
  const sessions = await lookupSessions(es, [...new Set(raw.flatMap((h) => (h._source!.session_id ? [h._source!.session_id] : [])))], trace);
  const total = typeof res.hits.total === "number" ? res.hits.total : (res.hits.total?.value ?? raw.length);
  return {
    total,
    hits: raw.map((h) => ({
      memory: h._source!,
      score: h._score ?? null,
      highlight: h.highlight?.content?.[0] ?? h.highlight?.text?.[0] ?? null,
      session: h._source!.session_id ? (sessions.get(h._source!.session_id) ?? null) : null,
    })),
  };
}

export interface MemorySearchParams {
  q: string;
  types?: SearchableType[];
  day?: string;
  size?: number;
}

/** Hybrid search over everything the attendee captured: keyword + semantic (ELSER) merged with RRF. */
export async function searchMemories(es: Client, params: MemorySearchParams): Promise<MemorySearchResult> {
  const trace: QueryTrace[] = [];
  const filter: estypes.QueryDslQueryContainer[] = [
    { term: { conference: DEFAULT_CONFERENCE.id } },
    { terms: { type: params.types?.length ? params.types : [...SEARCHABLE_TYPES] } },
  ];
  if (params.day) filter.push(buildDayFilter(params.day, await sessionsOnDay(es, params.day, trace)));
  const request = buildMemorySearchRequest(params.q, filter, params.size ?? 20);
  const hybrid = Boolean(params.q.trim());
  const result = await runMemorySearch(
    es,
    request,
    hybrid ? "Hybrid search over your memories: keyword + semantic, merged with RRF" : "Your latest memories",
    hybrid ? ["RRF", "multi_match", "semantic_text", EMBEDDING_CHIP, "semantic highlight"] : ["sort by created_at"],
    trace,
  );
  return { ...result, trace };
}

/**
 * "Related from your notes": what you captured in *other* talks that is semantically close to this one.
 * The query text is this session's title + abstract + the latest transcript you captured here.
 */
export async function relatedMemories(
  es: Client,
  session: Pick<SessionDoc, "id" | "title" | "description">,
  size = 5,
): Promise<MemorySearchResult> {
  const trace: QueryTrace[] = [];
  const transcriptReq = {
    index: INDEX.memories,
    size: 20,
    _source: ["text"],
    query: { bool: { filter: [{ term: { session_id: session.id } }, { term: { type: "transcript" } }] } },
    sort: [{ created_at: "desc" }],
  } satisfies estypes.SearchRequest;
  const transcriptRes = await es.search<{ text: string }>(transcriptReq);
  trace.push({ label: "What you heard in this talk (transcript)", features: ["term filter"], index: INDEX.memories, request: transcriptReq, tookMs: transcriptRes.took });
  const heard = transcriptRes.hits.hits.map((h) => h._source?.text ?? "").join(" ");
  // ELSER reads ~512 tokens, so keep the query text to a few paragraphs.
  const text = [session.title, session.description, heard].filter(Boolean).join("\n").slice(0, 2000);

  const request: estypes.SearchRequest = {
    index: INDEX.memories,
    size,
    query: {
      bool: {
        must: { semantic: { field: "content", query: text } },
        filter: [{ term: { conference: DEFAULT_CONFERENCE.id } }, { terms: { type: ["note", "summary", "contact"] } }],
        must_not: [{ term: { session_id: session.id } }],
      },
    },
    highlight: { fields: { content: { type: "semantic", number_of_fragments: 1 } } },
    _source: MEMORY_SOURCE,
  };
  const result = await runMemorySearch(
    es,
    request,
    "Semantic match against memories from other sessions",
    ["semantic_text", EMBEDDING_CHIP, "must_not this session", "semantic highlight"],
    trace,
  );
  return { ...result, trace };
}
