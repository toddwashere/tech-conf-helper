import type { Client } from "@elastic/elasticsearch";
import { DEFAULT_CONFERENCE } from "../conference";
import { INDEX, ROOMS_INDEX, ensurePlanInfra } from "../es/indices";
import { buildingFor, roomId, roomLocation } from "../geo";
import type { RoomDoc } from "../types";

let ready: Promise<void> | null = null;

/** Lazily creates `rooms` + `room-signals` and seeds rooms from the schedule, once per server process. */
export function ensurePlanReady(es: Client): Promise<void> {
  ready ??= (async () => {
    await ensurePlanInfra(es);
    await seedRooms(es);
  })().catch((err) => {
    ready = null;
    throw err;
  });
  return ready;
}

/** Builds one `rooms` doc per distinct room in `sessions` (a terms agg, not a full scan), with a geo_point. */
export async function seedRooms(es: Client, conference: string = DEFAULT_CONFERENCE.id, force = false): Promise<number> {
  if (!force) {
    const { count } = await es.count({ index: ROOMS_INDEX, query: { term: { conference } } });
    if (count > 0) return 0;
  }
  const res = await es.search({
    index: INDEX.sessions,
    size: 0,
    query: { term: { conference } },
    aggs: {
      rooms: {
        multi_terms: {
          terms: [{ field: "room" }, { field: "building", missing: "" }, { field: "room_level", missing: "" }],
          size: 500,
        },
      },
    },
  });
  const agg = res.aggregations?.rooms as { buckets: { key: string[] }[] } | undefined;
  const seen = new Set<string>();
  const docs: RoomDoc[] = [];
  for (const { key } of agg?.buckets ?? []) {
    const [name, building, level] = key;
    const id = roomId(conference, name);
    if (seen.has(id)) continue;
    seen.add(id);
    docs.push({
      id,
      conference,
      name,
      building: buildingFor(name, building || null),
      level: level || null,
      location: roomLocation(name, building || null),
    });
  }
  if (docs.length === 0) return 0;
  await es.bulk({
    refresh: "wait_for",
    operations: docs.flatMap((d) => [{ index: { _index: ROOMS_INDEX, _id: d.id } }, d]),
  });
  return docs.length;
}
