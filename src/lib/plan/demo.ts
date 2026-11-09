import type { Client } from "@elastic/elasticsearch";
import { DEFAULT_CONFERENCE } from "../conference";
import { ROOM_SIGNALS_STREAM } from "../es/indices";
import type { PlanDoc } from "../types";
import { clearSignals } from "./signals";
import { clearPlan, getSessions, planDocId } from "./store";
import { buildSimulatedSignals, SIMULATED_SOURCE } from "./simulate";
import { ensurePlanReady } from "./infra";
import { INDEX } from "../es/indices";

const id = (sourceId: string) => `${DEFAULT_CONFERENCE.id}:${sourceId}`;

/**
 * The demo persona's Tuesday: an observability + security person. In the 2:50 PM slot, Plan A
 * (eBPF instrumentation, 255 EF) fills up and the reroute sends them across the street to the Hyatt
 * for Plan B. Mark B and C full too and it falls back to a semantic match in the same building.
 */
export const DEMO_PLAN: { slot: string; choices: { sessionId: string; reason: string }[] }[] = [
  {
    slot: "11:30 AM",
    choices: [
      { sessionId: id("1335605"), reason: "SIG Instrumentation: where OTel in Kubernetes is heading" },
      { sessionId: id("1247249"), reason: "Backup: vulnerability triage at maintainer scale" },
    ],
  },
  {
    slot: "2:50 PM",
    choices: [
      { sessionId: id("1247277"), reason: "Must see: eBPF auto-instrumentation internals" },
      { sessionId: id("1236746"), reason: "Backup: eBPF runtime detection as code (Hyatt)" },
      { sessionId: id("1289635"), reason: "Backup: how Kubernetes handles AI-found CVEs" },
    ],
  },
  {
    slot: "3:40 PM",
    choices: [
      { sessionId: id("1243292"), reason: "Network paths as OTel traces" },
      { sessionId: id("1245768"), reason: "Backup: admission policies" },
      { sessionId: id("1289641"), reason: "Backup: high-cardinality metrics with Cortex" },
    ],
  },
];

export const DEMO_DAY = "2026-11-10";

/** Replaces the plan with the demo plan and clears app-written signals. Keeps simulated history. */
export async function seedDemoPlan(es: Client): Promise<PlanDoc[]> {
  await ensurePlanReady(es);
  await clearPlan(es);
  await clearSignals(es);
  const ids = DEMO_PLAN.flatMap((s) => s.choices.map((c) => c.sessionId));
  const sessions = await getSessions(es, ids);
  const missing = ids.filter((i) => !sessions.has(i));
  if (missing.length) throw new Error(`Demo sessions missing from the index: ${missing.join(", ")}`);
  // One bulk write: each slot takes Plan A's times, ranks follow the list order.
  const now = new Date().toISOString();
  const docs: PlanDoc[] = DEMO_PLAN.flatMap((slot) => {
    const planA = sessions.get(slot.choices[0].sessionId)!;
    return slot.choices.map((c, rank) => ({
      id: planDocId(planA.starts_at, c.sessionId),
      conference: DEFAULT_CONFERENCE.id,
      slot_start: planA.starts_at,
      slot_end: planA.ends_at,
      session_id: c.sessionId,
      rank,
      reason: c.reason,
      updated_at: now,
    }));
  });
  await es.bulk({
    refresh: "wait_for",
    operations: docs.flatMap((d) => [{ index: { _index: INDEX.plans, _id: d.id } }, d]),
  });
  return docs;
}

/** Rewrites the simulated room-signals history for the demo day (idempotent). */
export async function seedSimulatedSignals(es: Client, day = DEMO_DAY): Promise<number> {
  await ensurePlanReady(es);
  await es.deleteByQuery({
    index: ROOM_SIGNALS_STREAM,
    query: { term: { source: SIMULATED_SOURCE } },
    refresh: true,
    conflicts: "proceed",
  });
  const res = await es.search({
    index: INDEX.sessions,
    size: 500,
    _source: ["id", "conference", "title", "starts_at", "ends_at", "room", "building", "kind"],
    query: { bool: { filter: [{ term: { day } }, { term: { conference: DEFAULT_CONFERENCE.id } }] } },
  });
  const sessions = res.hits.hits.flatMap((h) => (h._source ? [h._source as Parameters<typeof buildSimulatedSignals>[0][number]] : []));
  const docs = buildSimulatedSignals(sessions, day);
  for (let i = 0; i < docs.length; i += 2000) {
    const chunk = docs.slice(i, i + 2000);
    const out = await es.bulk({
      refresh: "wait_for",
      operations: chunk.flatMap((d) => [{ create: { _index: ROOM_SIGNALS_STREAM } }, d]),
    });
    if (out.errors) throw new Error("Some simulated signals failed to index");
  }
  return docs.length;
}

export async function resetDemo(es: Client, opts: { simulated?: boolean } = {}): Promise<void> {
  await ensurePlanReady(es);
  await clearPlan(es);
  await clearSignals(es, DEFAULT_CONFERENCE.id, { includeSimulated: opts.simulated ?? false });
}
