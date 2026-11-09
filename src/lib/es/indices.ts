import type { Client } from "@elastic/elasticsearch";
import type { estypes } from "@elastic/elasticsearch";

export const INFERENCE_ID = process.env.ES_INFERENCE_ID ?? ".elser-2-elasticsearch";

export const INDEX = {
  sessions: "sessions",
  speakers: "speakers",
  memories: "memories",
  plans: "plans",
} as const;

const keyword = { type: "keyword" } as const;
const text = { type: "text" } as const;
const date = { type: "date" } as const;
const semantic = { type: "semantic_text", inference_id: INFERENCE_ID } as const;

export const MAPPINGS: Record<keyof typeof INDEX, estypes.MappingTypeMapping> = {
  sessions: {
    dynamic: "strict",
    properties: {
      id: keyword,
      conference: keyword,
      source: keyword,
      source_id: keyword,
      title: { type: "text", fields: { raw: keyword } },
      description: text,
      content: semantic,
      starts_at: date,
      ends_at: date,
      day: keyword,
      room: keyword,
      building: keyword,
      room_level: keyword,
      tracks: keyword,
      topics: { type: "keyword", fields: { text } },
      level: keyword,
      kind: keyword,
      full: { type: "boolean" },
      speakers: {
        properties: { id: keyword, name: text, tagline: text },
      },
      speaker_names: { type: "text", fields: { raw: keyword } },
      links: { properties: { label: keyword, url: { type: "keyword", index: false } } },
      doc_hash: keyword,
    },
  },
  speakers: {
    dynamic: "strict",
    properties: {
      id: keyword,
      conference: keyword,
      source: keyword,
      source_id: keyword,
      name: { type: "text", fields: { raw: keyword } },
      tagline: text,
      bio: text,
      photo_url: { type: "keyword", index: false },
      links: { properties: { type: keyword, url: { type: "keyword", index: false } } },
      session_ids: keyword,
    },
  },
  memories: {
    dynamic: "strict",
    properties: {
      id: keyword,
      type: keyword,
      conference: keyword,
      session_id: keyword,
      source: keyword,
      title: text,
      text: text,
      content: semantic,
      lang: keyword,
      starts_at_ms: { type: "long" },
      metadata: { type: "flattened" },
      created_at: date,
    },
  },
  plans: {
    dynamic: "strict",
    properties: {
      id: keyword,
      conference: keyword,
      slot_start: date,
      slot_end: date,
      session_id: keyword,
      rank: { type: "integer" },
      interest: { type: "integer" },
      reason: text,
      updated_at: date,
    },
  },
};

export async function ensureIndices(es: Client): Promise<string[]> {
  const created: string[] = [];
  for (const key of Object.keys(INDEX) as (keyof typeof INDEX)[]) {
    const index = INDEX[key];
    if (await es.indices.exists({ index })) continue;
    await es.indices.create({ index, mappings: MAPPINGS[key] });
    created.push(index);
  }
  return created;
}
