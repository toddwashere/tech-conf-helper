import type { Client, estypes } from "@elastic/elasticsearch";
import { INDEX } from "./es/indices";
import type { SearchFilters, SearchResponse, SessionDoc } from "./types";

export const SEARCH_SOURCE_FIELDS = { excludes: ["content", "doc_hash"] };

export function buildFilters(filters: SearchFilters): estypes.QueryDslQueryContainer[] {
  const clauses: estypes.QueryDslQueryContainer[] = [];
  if (filters.day) clauses.push({ term: { day: filters.day } });
  if (filters.track) clauses.push({ term: { tracks: filters.track } });
  if (filters.level) clauses.push({ term: { level: filters.level } });
  if (!filters.includeLogistics) clauses.push({ term: { kind: "talk" } });
  return clauses;
}

export function buildSearchRequest(query: string, filters: SearchFilters, size = 20): estypes.SearchRequest {
  const filter = buildFilters(filters);
  const q = query.trim();

  if (!q) {
    return {
      index: INDEX.sessions,
      size,
      query: { bool: { filter } },
      sort: [{ starts_at: "asc" }, { "title.raw": "asc" }],
      _source: SEARCH_SOURCE_FIELDS,
    };
  }

  return {
    index: INDEX.sessions,
    size,
    retriever: {
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
    },
    _source: SEARCH_SOURCE_FIELDS,
  };
}

export async function searchSessions(
  es: Client,
  query: string,
  filters: SearchFilters,
  size = 20,
): Promise<SearchResponse> {
  const res = await es.search<SessionDoc>(buildSearchRequest(query, filters, size));
  const total = typeof res.hits.total === "number" ? res.hits.total : (res.hits.total?.value ?? 0);
  return {
    total,
    hits: res.hits.hits.flatMap((h) => (h._source ? [{ session: h._source, score: h._score ?? null }] : [])),
  };
}
