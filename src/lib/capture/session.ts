import type { Client } from "@elastic/elasticsearch";
import { INDEX } from "@/lib/es/indices";
import type { SessionDoc } from "@/lib/types";

export async function getSessionById(es: Client, id: string): Promise<SessionDoc | null> {
  try {
    const res = await es.get<SessionDoc>({ index: INDEX.sessions, id, _source_excludes: ["content", "doc_hash"] });
    return res._source ?? null;
  } catch (error) {
    if ((error as { meta?: { statusCode?: number } }).meta?.statusCode === 404) return null;
    throw error;
  }
}

/** Route params can arrive still percent-encoded (ids contain ":"), so decode once, tolerating bad input. */
export function decodeSessionId(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}
