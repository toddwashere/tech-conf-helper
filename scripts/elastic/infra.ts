import type { Client } from "@elastic/elasticsearch";

export const SESSIONS_ENRICH_POLICY = "conference-sessions-by-id";

// Mirrors WS-A's `ensurePlanInfra` (same template name, pattern, and mapping) so the room-full workflow
// can write to the data stream even if the plan page hasn't run yet. Both sides skip when it exists.
const ROOM_SIGNALS_MAPPING = {
  dynamic: "strict",
  properties: {
    "@timestamp": { type: "date" },
    conference: { type: "keyword" },
    session_id: { type: "keyword" },
    room: { type: "keyword" },
    building: { type: "keyword" },
    signal: { type: "keyword" },
    source: { type: "keyword" },
    location: { type: "geo_point" },
  },
} as const;

export async function ensureRoomSignals(es: Client): Promise<string> {
  if (await es.indices.exists({ index: "room-signals" })) return "room-signals exists";
  if (!(await es.indices.existsIndexTemplate({ name: "room-signals" }))) {
    await es.indices.putIndexTemplate({
      name: "room-signals",
      index_patterns: ["room-signals*"],
      data_stream: {},
      priority: 500,
      template: { mappings: ROOM_SIGNALS_MAPPING },
    });
  }
  await es.indices.createDataStream({ name: "room-signals" });
  return "created room-signals data stream";
}

/** Enrich policy so ES|QL can join plans -> session titles (`ENRICH conference-sessions-by-id ON session_id`). */
export async function ensureSessionsEnrich(es: Client): Promise<string> {
  const existing = await es.enrich.getPolicy({ name: SESSIONS_ENRICH_POLICY });
  if (existing.policies.length === 0) {
    await es.enrich.putPolicy({
      name: SESSIONS_ENRICH_POLICY,
      match: {
        indices: "sessions",
        match_field: "id",
        enrich_fields: ["title", "room", "building", "starts_at", "ends_at", "tracks", "speaker_names"],
      },
    });
  }
  // Re-executing reads `sessions` into a fresh enrich index; it never writes to `sessions`.
  await es.enrich.executePolicy({ name: SESSIONS_ENRICH_POLICY, wait_for_completion: true });
  return `enrich policy ${SESSIONS_ENRICH_POLICY} executed`;
}
