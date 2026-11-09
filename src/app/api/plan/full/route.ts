import { z } from "zod";
import { getNow, isDemoClock } from "@/lib/clock";
import { getEs } from "@/lib/es/client";
import { ensurePlanReady } from "@/lib/plan/infra";
import { recordSignal } from "@/lib/plan/signals";
import { getSessions } from "@/lib/plan/store";
import { buildPlanView } from "@/lib/plan/view";
import type { QueryTrace } from "@/components/query-inspector";

const schema = z.object({
  sessionId: z.string().min(1).max(200),
  signal: z.enum(["full", "crowded", "checkin"]).default("full"),
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  at: z.string().optional(),
});

/** "Room full": appends a signal to the `room-signals` data stream, then returns the plan with its reroute. */
export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: "Expected { sessionId }." }, { status: 400 });
  const { sessionId, signal, day, at } = parsed.data;
  try {
    const es = getEs();
    await ensurePlanReady(es);
    const session = (await getSessions(es, [sessionId])).get(sessionId);
    if (!session) return Response.json({ error: "Session not found." }, { status: 404 });
    const now = getNow(at);
    const writeTrace: QueryTrace[] = [];
    const recorded = await recordSignal(es, session, signal, now, "app", writeTrace);
    const trace: QueryTrace[] = [...writeTrace];
    const slots = await buildPlanView(es, day ?? null, now, trace);
    const slot = slots.find((s) => s.choices.some((c) => c.session.id === sessionId)) ?? null;
    // The reroute panel shows the write that triggered it, then the queries that decided it.
    if (slot?.reroute) slot.reroute.trace = [...writeTrace, ...(slot.reroute.trace ?? [])];
    return Response.json({
      signal: recorded,
      reroute: slot?.reroute ?? null,
      trace,
      plan: { now: now.toISOString(), demoClock: isDemoClock(at), day: day ?? null, slots, trace },
    });
  } catch (error) {
    console.error("[plan] room full failed", error);
    return Response.json({ error: "Couldn't record the signal. Is Elasticsearch running?" }, { status: 502 });
  }
}
