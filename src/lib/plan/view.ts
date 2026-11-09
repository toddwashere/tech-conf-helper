import type { Client, estypes } from "@elastic/elasticsearch";
import { addMinutes } from "../clock";
import { INDEX } from "../es/indices";
import { SEARCH_SOURCE_FIELDS } from "../search";
import type {
  FullReason,
  NowNextItem,
  NowNextResponse,
  PlanChoice,
  PlanSlotView,
  RerouteCandidate,
  SessionDoc,
} from "../types";
import { pickReroute } from "./reroute";
import { nearbyRooms, roomPoint } from "./rooms";
import { recentFullSignals } from "./signals";
import { computeConflicts, rankLabel } from "./slots";
import { getSessions, listPlanDocs } from "./store";
import { tracedSearch, type Tracer } from "./trace";

/** How far you'd walk for a similar talk. Covers Salt Palace ↔ Hyatt Regency, excludes off-site venues. */
export const NEARBY_RADIUS = "600m";

function fullness(session: SessionDoc, signals: Map<string, string>): { full: boolean; fullReason: FullReason; fullSince: string | null } {
  if (session.full) return { full: true, fullReason: "sold_out", fullSince: null };
  const since = signals.get(session.id);
  return since ? { full: true, fullReason: "signal", fullSince: since } : { full: false, fullReason: null, fullSince: null };
}

/**
 * Similar talks for a full Plan A: a `semantic` query on `content` with Plan A's title and description,
 * filtered to open talks overlapping the slot in rooms a `geo_distance` query says are nearby.
 */
export async function similarTalks(
  es: Client,
  planA: SessionDoc,
  slot: { slotStart: string; slotEnd: string },
  excludeIds: string[],
  now: Date,
  trace?: Tracer,
): Promise<RerouteCandidate[]> {
  const nearby = await nearbyRooms(es, await roomPoint(es, planA.room), NEARBY_RADIUS, trace);
  const distance = new Map(nearby.map((n) => [n.room.name, n.distanceM]));
  if (distance.size === 0) return [];

  const filter: estypes.QueryDslQueryContainer[] = [
    { term: { kind: "talk" } },
    { term: { full: false } },
    { terms: { room: [...distance.keys()] } },
    // Overlaps the slot, and still has at least 10 minutes left when the slot starts.
    { range: { starts_at: { lt: slot.slotEnd } } },
    { range: { ends_at: { gt: addMinutes(new Date(slot.slotStart), 10).toISOString() } } },
  ];
  const res = await tracedSearch<SessionDoc>(es, trace, {
    label: "Talks closest in meaning to Plan A, open, in the same slot, in a nearby room",
    features: ["semantic_text", "semantic query", "time range", "terms (nearby rooms)"],
  }, {
    index: INDEX.sessions,
    size: 10,
    query: {
      bool: {
        must: { semantic: { field: "content", query: `${planA.title}\n\n${planA.description}`.slice(0, 2000) } },
        filter,
        must_not: [{ ids: { values: excludeIds } }],
      },
    },
    _source: SEARCH_SOURCE_FIELDS,
  });
  const hits = res.hits.hits.flatMap((h) => (h._source ? [{ s: h._source, score: h._score ?? 0 }] : []));
  const signals = await recentFullSignals(es, hits.map((h) => h.s.id), now, trace);
  return hits
    .filter((h) => !signals.has(h.s.id))
    .map((h) => ({
      session: h.s,
      score: h.score,
      distanceM: distance.get(h.s.room) ?? null,
      sameBuilding: !!planA.building && h.s.building === planA.building,
    }));
}

export async function buildPlanView(es: Client, day: string | null, now: Date, trace?: Tracer): Promise<PlanSlotView[]> {
  const docs = await listPlanDocs(es, day, trace);
  const sessions = await getSessions(es, [...new Set(docs.map((d) => d.session_id))]);
  const fullTrace: Tracer = [];
  const signals = await recentFullSignals(es, [...sessions.keys()], now, fullTrace);
  trace?.push(...fullTrace);

  const grouped = new Map<string, { slotStart: string; slotEnd: string; choices: PlanChoice[] }>();
  for (const d of docs) {
    const session = sessions.get(d.session_id);
    if (!session) continue;
    const slot = grouped.get(d.slot_start) ?? { slotStart: d.slot_start, slotEnd: d.slot_end, choices: [] };
    const rank = slot.choices.length;
    slot.choices.push({ rank, label: rankLabel(rank), session, ...fullness(session, signals) });
    grouped.set(d.slot_start, slot);
  }

  const slots = [...grouped.values()];
  const conflicts = computeConflicts(
    slots.map((s) => ({
      slotStart: s.slotStart,
      planA: s.choices[0] ? { start: s.choices[0].session.starts_at, end: s.choices[0].session.ends_at } : null,
    })),
  );

  return Promise.all(
    slots.map(async (s) => {
      let reroute = null;
      const planA = s.choices[0];
      if (planA?.full) {
        const needSimilar = s.choices.slice(1).every((c) => c.full);
        const slotTrace: Tracer = [...fullTrace];
        const similar = needSimilar
          ? await similarTalks(es, planA.session, s, s.choices.map((c) => c.session.id), now, slotTrace)
          : [];
        const picked = pickReroute(s.choices, similar);
        if (picked) reroute = { ...picked, trace: slotTrace };
        if (trace && slotTrace.length > fullTrace.length) trace.push(...slotTrace.slice(fullTrace.length));
      }
      return { ...s, conflictsWith: conflicts.get(s.slotStart) ?? [], reroute };
    }),
  );
}

/** Talks in progress or starting within `windowMin` of `now`, nearest room first (time range + geo sort). */
export async function nowNext(
  es: Client,
  now: Date,
  fromRoom: string | null,
  windowMin = 30,
  trace: Tracer = [],
): Promise<NowNextResponse> {
  const from = await roomPoint(es, fromRoom);
  const rooms = await nearbyRooms(es, from, "5km", trace);
  const distance = new Map(rooms.map((r) => [r.room.name, r.distanceM]));
  const nowIso = now.toISOString();
  const res = await tracedSearch<SessionDoc>(es, trace, {
    label: `Talks on now or starting in the next ${windowMin} min`,
    features: ["time range", "bool should"],
  }, {
    index: INDEX.sessions,
    size: 200,
    query: {
      bool: {
        filter: [{ term: { kind: "talk" } }],
        should: [
          { bool: { filter: [{ range: { starts_at: { lte: nowIso } } }, { range: { ends_at: { gt: nowIso } } }] } },
          { range: { starts_at: { gt: nowIso, lte: addMinutes(now, windowMin).toISOString() } } },
        ],
        minimum_should_match: 1,
      },
    },
    _source: SEARCH_SOURCE_FIELDS,
  });
  const sessions = res.hits.hits.flatMap((h) => (h._source ? [h._source] : []));
  const signals = await recentFullSignals(es, sessions.map((s) => s.id), now, trace);
  const items: NowNextItem[] = sessions
    // Multi-hour expo blocks drown out real talks; keep sessions up to 2 hours.
    .filter((s) => new Date(s.ends_at).getTime() - new Date(s.starts_at).getTime() <= 2 * 3_600_000)
    .map((s) => {
      const minutesUntil = Math.round((new Date(s.starts_at).getTime() - now.getTime()) / 60_000);
      return {
        session: s,
        status: minutesUntil > 0 ? ("next" as const) : ("now" as const),
        minutesUntil,
        distanceM: distance.get(s.room) ?? null,
        full: s.full || signals.has(s.id),
      };
    })
    .sort(
      (a, b) =>
        (a.distanceM ?? Infinity) - (b.distanceM ?? Infinity) ||
        a.session.starts_at.localeCompare(b.session.starts_at),
    );
  return { now: nowIso, from: fromRoom, items, trace };
}
