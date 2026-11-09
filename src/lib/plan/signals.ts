import type { Client } from "@elastic/elasticsearch";
import { DEFAULT_CONFERENCE } from "../conference";
import { ROOM_SIGNALS_STREAM } from "../es/indices";
import { roomLocation } from "../geo";
import { DEFAULT_TIME_ZONE, localToZonedIso } from "../time";
import { tracedSearch, type Tracer } from "./trace";
import type { RoomActivity, RoomSignalDoc, RoomSignalKind, SessionDoc } from "../types";

/** A `full` signal counts for this long. Rooms empty out between talks. */
export const FULL_SIGNAL_WINDOW_MIN = 60;

/** Appends a signal to the `room-signals` data stream. Sessions are never updated. */
export async function recordSignal(
  es: Client,
  session: SessionDoc,
  signal: RoomSignalKind,
  at: Date,
  source = "app",
  trace?: Tracer,
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
  trace?.push({
    label: `Append a "${signal}" signal (never updates the session)`,
    features: ["data stream", "op_type: create", "geo_point"],
    index: ROOM_SIGNALS_STREAM,
    request: doc,
    tookMs: null,
  });
  return doc;
}

/** Latest `full` signal per session within the window before `now` (time-series range + terms/max agg). */
export async function recentFullSignals(
  es: Client,
  sessionIds: string[],
  now: Date,
  trace?: Tracer,
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (sessionIds.length === 0) return out;
  const res = await tracedSearch(es, trace, {
    label: `Is the room full? Latest "full" signal per talk in the last ${FULL_SIGNAL_WINDOW_MIN} min`,
    features: ["data stream", "time range", "terms agg", "max agg"],
  }, {
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
        // Simulated history feeds dashboards only; it never marks a real talk full.
        must_not: [{ term: { source: "simulated" } }],
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

/** Demo reset: removes this conference's signals (delete_by_query works on data streams). Keeps simulated history unless asked. */
export async function clearSignals(
  es: Client,
  conference: string = DEFAULT_CONFERENCE.id,
  opts: { includeSimulated?: boolean } = {},
): Promise<number> {
  const res = await es.deleteByQuery({
    index: ROOM_SIGNALS_STREAM,
    query: {
      bool: {
        filter: [{ term: { conference } }],
        must_not: opts.includeSimulated ? [] : [{ term: { source: "simulated" } }],
      },
    },
    refresh: true,
    conflicts: "proceed",
  });
  return res.deleted ?? 0;
}

/** Time-series view of `room-signals`: 30-minute date_histogram split by signal, and top rooms by check-ins. */
export async function roomActivity(es: Client, day: string, now: Date, trace?: Tracer): Promise<RoomActivity> {
  const from = localToZonedIso(`${day}T07:00`);
  const dayEnd = localToZonedIso(`${day}T20:00`);
  const until = now.toISOString() < new Date(dayEnd).toISOString() ? now.toISOString() : new Date(dayEnd).toISOString();
  const res = await tracedSearch(es, trace, {
    label: "Room activity: signals per 30 min, split by type, plus busiest rooms",
    features: ["data stream", "time range", "date_histogram", "terms agg", "filter agg"],
  }, {
    index: ROOM_SIGNALS_STREAM,
    size: 0,
    query: { range: { "@timestamp": { gte: from, lte: until } } },
    aggs: {
      over_time: {
        date_histogram: {
          field: "@timestamp",
          fixed_interval: "30m",
          time_zone: DEFAULT_TIME_ZONE,
          extended_bounds: { min: from, max: until },
        },
        aggs: { by_signal: { terms: { field: "signal", size: 3 } } },
      },
      simulated: { filter: { term: { source: "simulated" } } },
      rooms: {
        terms: { field: "room", size: 5, order: { checkins: "desc" } },
        aggs: {
          checkins: { filter: { term: { signal: "checkin" } } },
          full: { filter: { term: { signal: "full" } } },
        },
      },
    },
  });
  type Hist = { buckets: { key_as_string: string; by_signal: { buckets: { key: string; doc_count: number }[] } }[] };
  type Rooms = { buckets: { key: string; checkins: { doc_count: number }; full: { doc_count: number } }[] };
  const aggs = res.aggregations as unknown as { over_time: Hist; simulated: { doc_count: number }; rooms: Rooms };
  const total = typeof res.hits.total === "number" ? res.hits.total : (res.hits.total?.value ?? 0);
  return {
    day,
    until,
    total,
    simulated: aggs.simulated.doc_count,
    buckets: aggs.over_time.buckets.map((b) => {
      const get = (k: string) => b.by_signal.buckets.find((x) => x.key === k)?.doc_count ?? 0;
      return { start: b.key_as_string, checkin: get("checkin"), crowded: get("crowded"), full: get("full") };
    }),
    busiestRooms: aggs.rooms.buckets.map((b) => ({ room: b.key, checkins: b.checkins.doc_count, full: b.full.doc_count })),
  };
}
