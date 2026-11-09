import type { Client } from "@elastic/elasticsearch";
import { DEFAULT_CONFERENCE } from "@/lib/conference";
import { INDEX } from "@/lib/es/indices";
import type { MemoryDoc, MemoryType } from "@/lib/types";
import type { MemoryInput } from "./memory-schema";

const SOURCE = { excludes: ["content"] };

/** Bulk upsert by id, so retries from a flaky venue network never duplicate a chunk or note. */
export async function bulkSaveMemories(es: Client, inputs: MemoryInput[]): Promise<{ saved: string[]; failed: string[] }> {
  const now = new Date().toISOString();
  const operations = inputs.flatMap((m) => {
    const doc: MemoryDoc & { content: string } = {
      id: m.id,
      type: m.type,
      conference: DEFAULT_CONFERENCE.id,
      session_id: m.session_id,
      source: m.source,
      title: m.title ?? null,
      text: m.text,
      // Feeds the semantic index so Ask can find what was said or written in a talk.
      content: m.title ? `${m.title}\n${m.text}` : m.text,
      lang: m.lang ?? "en",
      starts_at_ms: m.starts_at_ms ?? null,
      metadata: m.metadata ?? null,
      created_at: m.created_at ?? now,
    };
    return [{ index: { _index: INDEX.memories, _id: m.id } }, doc];
  });
  const res = await es.bulk({ operations, refresh: "wait_for" });
  const saved: string[] = [];
  const failed: string[] = [];
  res.items.forEach((item, i) => {
    const op = item.index;
    if (op?.error) {
      console.error("[memories] bulk item failed", inputs[i].id, op.error);
      failed.push(inputs[i].id);
    } else saved.push(inputs[i].id);
  });
  return { saved, failed };
}

export async function listSessionMemories(
  es: Client,
  sessionId: string,
  types: MemoryType[],
  size = 500,
): Promise<MemoryDoc[]> {
  const res = await es.search<MemoryDoc>({
    index: INDEX.memories,
    size,
    query: { bool: { filter: [{ term: { session_id: sessionId } }, { terms: { type: types } }] } },
    sort: [{ starts_at_ms: { order: "asc", missing: "_last" } }, { created_at: "asc" }],
    _source: SOURCE,
  });
  return res.hits.hits.flatMap((h) => (h._source ? [h._source] : []));
}

export async function saveSummaryMemory(es: Client, doc: MemoryDoc): Promise<void> {
  await es.index({
    index: INDEX.memories,
    id: doc.id,
    document: { ...doc, content: doc.title ? `${doc.title}\n${doc.text}` : doc.text },
    refresh: "wait_for",
  });
}

export async function listConferenceMemories(es: Client, types: MemoryType[], size = 2000): Promise<MemoryDoc[]> {
  const res = await es.search<MemoryDoc>({
    index: INDEX.memories,
    size,
    query: { bool: { filter: [{ term: { conference: DEFAULT_CONFERENCE.id } }, { terms: { type: types } }] } },
    sort: [{ created_at: "asc" }],
    _source: SOURCE,
  });
  return res.hits.hits.flatMap((h) => (h._source ? [h._source] : []));
}
