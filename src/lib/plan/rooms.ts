import type { Client } from "@elastic/elasticsearch";
import { DEFAULT_CONFERENCE } from "../conference";
import { ROOMS_INDEX } from "../es/indices";
import { BUILDINGS, roomId } from "../geo";
import type { GeoPoint, RoomDoc } from "../types";

export async function getRoom(es: Client, room: string, conference: string = DEFAULT_CONFERENCE.id): Promise<RoomDoc | null> {
  const res = await es.get<RoomDoc>({ index: ROOMS_INDEX, id: roomId(conference, room) }, { ignore: [404] });
  return res.found ? (res._source ?? null) : null;
}

export async function roomPoint(es: Client, room: string | null | undefined): Promise<GeoPoint> {
  if (room) {
    const doc = await getRoom(es, room);
    if (doc) return doc.location;
  }
  return BUILDINGS["Salt Palace"];
}

export interface NearbyRoom {
  room: RoomDoc;
  distanceM: number;
}

/** Rooms within `radius` of a point, nearest first: a `geo_distance` filter plus a `_geo_distance` sort. */
export async function nearbyRooms(
  es: Client,
  from: GeoPoint,
  radius = "600m",
  conference: string = DEFAULT_CONFERENCE.id,
): Promise<NearbyRoom[]> {
  const res = await es.search<RoomDoc>({
    index: ROOMS_INDEX,
    size: 500,
    query: {
      bool: { filter: [{ term: { conference } }, { geo_distance: { distance: radius, location: from } }] },
    },
    sort: [{ _geo_distance: { location: from, order: "asc", unit: "m", distance_type: "arc" } }],
  });
  return res.hits.hits.flatMap((h) =>
    h._source ? [{ room: h._source, distanceM: Math.round(Number(h.sort?.[0] ?? 0)) }] : [],
  );
}
