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

// --- WS-A: rooms (geo) and room-signals (time-series data stream) ---

export const ROOMS_INDEX = "rooms";
export const ROOM_SIGNALS_STREAM = "room-signals";

export const ROOMS_MAPPING: estypes.MappingTypeMapping = {
  dynamic: "strict",
  properties: {
    id: keyword,
    conference: keyword,
    name: keyword,
    building: keyword,
    level: keyword,
    location: { type: "geo_point" },
  },
};

export const ROOM_SIGNALS_MAPPING: estypes.MappingTypeMapping = {
  dynamic: "strict",
  properties: {
    "@timestamp": date,
    conference: keyword,
    session_id: keyword,
    room: keyword,
    building: keyword,
    signal: keyword,
    source: keyword,
    location: { type: "geo_point" },
  },
};

/** Creates the `rooms` index and the `room-signals` index template + data stream if they're missing. */
export async function ensurePlanInfra(es: Client): Promise<string[]> {
  const created: string[] = [];
  if (!(await es.indices.exists({ index: ROOMS_INDEX }))) {
    await es.indices.create({ index: ROOMS_INDEX, mappings: ROOMS_MAPPING });
    created.push(ROOMS_INDEX);
  }
  if (!(await es.indices.existsIndexTemplate({ name: ROOM_SIGNALS_STREAM }))) {
    await es.indices.putIndexTemplate({
      name: ROOM_SIGNALS_STREAM,
      index_patterns: [`${ROOM_SIGNALS_STREAM}*`],
      data_stream: {},
      priority: 500,
      template: { mappings: ROOM_SIGNALS_MAPPING },
    });
    created.push(`${ROOM_SIGNALS_STREAM} template`);
  }
  if (!(await es.indices.exists({ index: ROOM_SIGNALS_STREAM }))) {
    await es.indices.createDataStream({ name: ROOM_SIGNALS_STREAM });
    created.push(ROOM_SIGNALS_STREAM);
  }
  return created;
}

// --- WS-C: cached agent answers for the demo (keyed by normalized question) ---

export const ASK_CACHE_INDEX = "ask-cache";

export const ASK_CACHE_MAPPING: estypes.MappingTypeMapping = {
  dynamic: "strict",
  properties: {
    key: keyword,
    question: text,
    response: { type: "object", enabled: false },
    model: keyword,
    created_at: date,
  },
};
