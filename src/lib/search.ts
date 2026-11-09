import type { Client, estypes } from "@elastic/elasticsearch";
import { INDEX } from "./es/indices";
import type { QueryTrace } from "@/components/query-inspector";
import type { EmbeddingsProfile, SearchFilters, SearchMeta, SearchOptions, SearchResponse, SessionDoc } from "./types";

export const SEARCH_SOURCE_FIELDS = { excludes: ["content", "doc_hash"] };

// Each embeddings profile has its own copy of the schedule. `sessions` is embedded with ELSER (local, offline);
// `sessions-jina` is the same documents re-embedded by the Jina model on the Elastic Inference Service (multilingual).
export const PROFILE_INDEX: Record<EmbeddingsProfile, string> = {
  elser: INDEX.sessions,
  jina: "sessions-jina",
};

export const RERANK_INFERENCE_ID: Record<EmbeddingsProfile, string> = {
  elser: process.env.RERANK_INFERENCE_ID ?? ".rerank-v1-elasticsearch",
  jina: process.env.JINA_RERANK_INFERENCE_ID ?? ".jina-reranker-v3.5",
};

// The local reranker is a cross-encoder on CPU (~300 ms per document here), so it only rescores the top few.
// Jina's reranker runs on EIS GPUs, so it can rescore the whole RRF window.
export const RERANK_WINDOW: Record<EmbeddingsProfile, number> = { elser: 10, jina: 50 };

export function defaultProfile(): EmbeddingsProfile {
  return process.env.EMBEDDINGS === "jina" ? "jina" : "elser";
}

export function buildFilters(filters: SearchFilters): estypes.QueryDslQueryContainer[] {
  const clauses: estypes.QueryDslQueryContainer[] = [];
  if (filters.day) clauses.push({ term: { day: filters.day } });
  if (filters.track) clauses.push({ term: { tracks: filters.track } });
  if (filters.level) clauses.push({ term: { level: filters.level } });
  if (!filters.includeLogistics) clauses.push({ term: { kind: "talk" } });
  return clauses;
}

export function buildHybridRetriever(q: string, filter: estypes.QueryDslQueryContainer[]): estypes.RetrieverContainer {
  return {
    rrf: {
      retrievers: [
        {
          standard: {
            query: {
              bool: {
                must: {
                  multi_match: {
                    query: q,
                    fields: ["title^3", "speaker_names^2", "topics.text^2", "description"],
                  },
                },
                filter,
              },
            },
          },
        },
        {
          standard: {
            query: { bool: { must: { semantic: { field: "content", query: q } }, filter } },
          },
        },
      ],
      rank_window_size: 50,
    },
  };
}

export function buildSearchRequest(
  query: string,
  filters: SearchFilters,
  size = 20,
  options: SearchOptions = {},
): estypes.SearchRequest {
  const profile = options.profile ?? defaultProfile();
  const index = PROFILE_INDEX[profile];
  const filter = buildFilters(filters);
  const q = query.trim();

  if (!q) {
    return {
      index,
      size,
      query: { bool: { filter } },
      sort: [{ starts_at: "asc" }, { "title.raw": "asc" }],
      _source: SEARCH_SOURCE_FIELDS,
    };
  }

  const hybrid = buildHybridRetriever(q, filter);
  const retriever: estypes.RetrieverContainer = options.rerank
    ? {
        text_similarity_reranker: {
          retriever: hybrid,
          field: "title",
          inference_id: RERANK_INFERENCE_ID[profile],
          inference_text: q,
          rank_window_size: RERANK_WINDOW[profile],
        },
      }
    : hybrid;

  // The reranker can only return what it rescored, so a reranked search is capped at the window.
  return { index, size: options.rerank ? Math.min(size, RERANK_WINDOW[profile]) : size, retriever, _source: SEARCH_SOURCE_FIELDS };
}

export async function searchSessions(
  es: Client,
  query: string,
  filters: SearchFilters,
  size = 20,
  options: SearchOptions = {},
): Promise<SearchResponse & SearchMeta> {
  const started = Date.now();
  const request = buildSearchRequest(query, filters, size, options);
  const res = await es.search<SessionDoc>(request);
  const total = typeof res.hits.total === "number" ? res.hits.total : (res.hits.total?.value ?? 0);
  return {
    total,
    hits: res.hits.hits.flatMap((h) => (h._source ? [{ session: h._source, score: h._score ?? null }] : [])),
    profile: options.profile ?? defaultProfile(),
    reranked: Boolean(options.rerank && query.trim()),
    tookMs: Date.now() - started,
    trace: [searchTrace(request, query, options, res.took)],
  };
}

export function searchTrace(request: estypes.SearchRequest, query: string, options: SearchOptions, took: number): QueryTrace {
  const profile = options.profile ?? defaultProfile();
  const { index, ...body } = request;
  const model = profile === "jina" ? "Jina v5 on EIS (multilingual)" : "ELSER (local)";
  if (!query.trim()) {
    return { label: "Schedule list: filters, sorted by start time", features: ["bool filter", "sort"], request: body, index: String(index), tookMs: took };
  }
  const features = ["retriever", "RRF", "multi_match (BM25)", "semantic_text", model];
  if (options.rerank) features.push(`text_similarity_reranker (top ${RERANK_WINDOW[profile]})`, RERANK_INFERENCE_ID[profile]);
  return {
    label: `Hybrid search: keyword + ${model} semantic, merged with RRF${options.rerank ? ", then reranked" : ""}`,
    features,
    request: body,
    index: String(index),
    tookMs: took,
  };
}
