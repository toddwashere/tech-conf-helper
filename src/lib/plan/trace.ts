import type { Client, estypes } from "@elastic/elasticsearch";
import type { QueryTrace } from "@/components/query-inspector";

/** Collects the real request bodies sent to Elasticsearch so the UI can show them. Optional everywhere. */
export type Tracer = QueryTrace[] | undefined;

export interface TraceMeta {
  label: string;
  features: string[];
}

/** Runs a search and, when tracing, records its body (without `index`), the index, and ES's own `took`. */
export async function tracedSearch<T = unknown>(
  es: Client,
  trace: Tracer,
  meta: TraceMeta,
  request: estypes.SearchRequest,
): Promise<estypes.SearchResponse<T>> {
  const res = await es.search<T>(request);
  if (trace) {
    const { index, ...body } = request;
    trace.push({ ...meta, index: String(index), request: body, tookMs: res.took });
  }
  return res;
}
