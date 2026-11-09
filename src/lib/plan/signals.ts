import type { Client } from "@elastic/elasticsearch";
import { DEFAULT_CONFERENCE } from "../conference";
import { ROOM_SIGNALS_STREAM } from "../es/indices";
import { roomLocation } from "../geo";
import type { RoomSignalDoc, RoomSignalKind, SessionDoc } from "../types";

/** A `full` signal counts for this long. Rooms empty out between talks. */
export const FULL_SIGNAL_WINDOW_MIN = 60;

/** Appends a signal to the `room-signals` data stream. Sessions are never updated. */
export async function recordSignal(
  es: Client,
  session: SessionDoc,
  signal: RoomSignalKind,
  at: Date,
  source = "app",
): Promise<RoomSignalDoc> {
  const doc: RoomSignalDoc = {
    "@timestamp": at.toISOString(),
    conference: session.conference,
    session_id: session.id,
    room: session.room,
    building: session.building,
    signal,
    source,
    location: roomLocation(session.room, session.building),
  };
  await es.index({ index: ROOM_SIGNALS_STREAM, op_type: "create", document: doc, refresh: "wait_for" });
  return doc;
}

/** Latest `full` signal per session within the window before `now` (time-series range + terms/max agg). */
export async function recentFullSignals(es: Client, sessionIds: string[], now: Date): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (sessionIds.length === 0) return out;
  const res = await es.search({
    index: ROOM_SIGNALS_STREAM,
    size: 0,
    query: {
      bool: {
        filter: [
          { terms: { session_id: sessionIds } },
          { term: { signal: "full" } },
          {
            range: {
              "@timestamp": {
                gte: new Date(now.getTime() - FULL_SIGNAL_WINDOW_MIN * 60_000).toISOString(),
                lte: now.toISOString(),
              },
            },
          },
        ],
      },
    },
    aggs: {
      by_session: {
        terms: { field: "session_id", size: Math.max(10, sessionIds.length) },
        aggs: { last: { max: { field: "@timestamp" } } },
      },
    },
  });
  const agg = res.aggregations?.by_session as
    | { buckets: { key: string; last: { value_as_string?: string; value: number } }[] }
    | undefined;
  for (const b of agg?.buckets ?? []) out.set(b.key, b.last.value_as_string ?? new Date(b.last.value).toISOString());
  return out;
}

/** Demo reset: removes this conference's signals (delete_by_query works on data streams). */
export async function clearSignals(es: Client, conference: string = DEFAULT_CONFERENCE.id): Promise<number> {
  const res = await es.deleteByQuery({
    index: ROOM_SIGNALS_STREAM,
    query: { term: { conference } },
    refresh: true,
    conflicts: "proceed",
  });
  return res.deleted ?? 0;
}
