import type { Client } from "@elastic/elasticsearch";
import { DEFAULT_CONFERENCE } from "../conference";
import { INDEX } from "../es/indices";
import { SEARCH_SOURCE_FIELDS } from "../search";
import { localToZonedIso } from "../time";
import type { PlanDoc, SessionDoc } from "../types";
import { findSlotFor } from "./slots";
import { tracedSearch, type Tracer } from "./trace";

const CONF = DEFAULT_CONFERENCE.id;

export function planDocId(slotStart: string, sessionId: string): string {
  return `${CONF}:${slotStart}:${sessionId}`;
}

function nextDay(day: string): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** All plan rows (single demo user), optionally for one conference day, ordered by slot then rank. */
export async function listPlanDocs(es: Client, day?: string | null, trace?: Tracer): Promise<PlanDoc[]> {
  const filter: object[] = [{ term: { conference: CONF } }];
  if (day) {
    filter.push({
      range: { slot_start: { gte: localToZonedIso(`${day}T00:00`), lt: localToZonedIso(`${nextDay(day)}T00:00`) } },
    });
  }
  const res = await tracedSearch<PlanDoc>(es, trace, {
    label: "Your plan for the day, by slot then rank",
    features: ["time range", "sort"],
  }, {
    index: INDEX.plans,
    size: 1000,
    query: { bool: { filter } },
    sort: [{ slot_start: "asc" }, { rank: "asc" }],
  });
  return res.hits.hits.flatMap((h) => (h._source ? [h._source] : []));
}

export async function getSessions(es: Client, ids: string[]): Promise<Map<string, SessionDoc>> {
  const out = new Map<string, SessionDoc>();
  if (ids.length === 0) return out;
  const res = await es.mget<SessionDoc>({ index: INDEX.sessions, ids, _source_excludes: SEARCH_SOURCE_FIELDS.excludes });
  for (const d of res.docs) if ("found" in d && d.found && d._source) out.set(d._id, d._source);
  return out;
}

function slotsOf(docs: PlanDoc[]) {
  const map = new Map<string, { slotStart: string; slotEnd: string; ids: string[] }>();
  for (const d of docs) {
    const s = map.get(d.slot_start) ?? { slotStart: d.slot_start, slotEnd: d.slot_end, ids: [] };
    s.ids.push(d.session_id);
    map.set(d.slot_start, s);
  }
  return [...map.values()];
}

/** Adds a session to the slot it overlaps (as the lowest-ranked choice) or opens a new slot. */
export async function addChoice(es: Client, session: SessionDoc, reason?: string): Promise<PlanDoc> {
  const slots = slotsOf(await listPlanDocs(es));
  const slot = findSlotFor({ start: session.starts_at, end: session.ends_at }, slots);
  const slotStart = slot?.slotStart ?? session.starts_at;
  const slotEnd = slot?.slotEnd ?? session.ends_at;
  const existing = slots.find((s) => s.slotStart === slotStart);
  const already = existing?.ids.indexOf(session.id) ?? -1;
  // Already planned: keep its rank and note rather than overwriting the row.
  if (already >= 0) {
    const current = (await listPlanDocs(es)).find((d) => d.slot_start === slotStart && d.session_id === session.id);
    if (current) return current;
  }
  const doc: PlanDoc = {
    id: planDocId(slotStart, session.id),
    conference: CONF,
    slot_start: slotStart,
    slot_end: slotEnd,
    session_id: session.id,
    rank: already >= 0 ? already : (existing?.ids.length ?? 0),
    ...(reason ? { reason } : {}),
    updated_at: new Date().toISOString(),
  };
  await es.index({ index: INDEX.plans, id: doc.id, document: doc, refresh: "wait_for" });
  return doc;
}

/** Rewrites ranks for a slot in the given order. Ids not in the slot are ignored. */
export async function reorderSlot(es: Client, slotStart: string, sessionIds: string[]): Promise<void> {
  const current = (await listPlanDocs(es)).filter((d) => d.slot_start === slotStart);
  const known = new Set(current.map((d) => d.session_id));
  const ordered = [...sessionIds.filter((id) => known.has(id)), ...current.map((d) => d.session_id).filter((id) => !sessionIds.includes(id))];
  if (ordered.length === 0) return;
  const now = new Date().toISOString();
  await es.bulk({
    refresh: "wait_for",
    operations: ordered.flatMap((id, rank) => [
      { update: { _index: INDEX.plans, _id: planDocId(slotStart, id) } },
      { doc: { rank, updated_at: now } },
    ]),
  });
}

export async function removeChoice(es: Client, slotStart: string, sessionId: string): Promise<void> {
  await es.delete({ index: INDEX.plans, id: planDocId(slotStart, sessionId), refresh: "wait_for" }, { ignore: [404] });
  const rest = (await listPlanDocs(es)).filter((d) => d.slot_start === slotStart).map((d) => d.session_id);
  await reorderSlot(es, slotStart, rest);
}

export async function clearPlan(es: Client): Promise<void> {
  await es.deleteByQuery({ index: INDEX.plans, query: { term: { conference: CONF } }, refresh: true, conflicts: "proceed" });
}
