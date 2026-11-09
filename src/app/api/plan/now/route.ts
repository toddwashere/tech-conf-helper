import { getNow } from "@/lib/clock";
import { getEs } from "@/lib/es/client";
import { ensurePlanReady } from "@/lib/plan/infra";
import { overlaps } from "@/lib/plan/slots";
import { getSessions, listPlanDocs } from "@/lib/plan/store";
import { nowNext } from "@/lib/plan/view";

/** The room you're probably in: Plan A of the plan slot happening now (or starting soonest). */
async function currentRoom(now: Date): Promise<string | null> {
  const es = getEs();
  const planA = (await listPlanDocs(es)).filter((d) => d.rank === 0);
  const nowIso = now.toISOString();
  const current =
    planA.find((d) => overlaps({ start: d.slot_start, end: d.slot_end }, { start: nowIso, end: nowIso.replace(/Z$/, "1Z") })) ??
    planA.find((d) => new Date(d.slot_start) > now);
  if (!current) return null;
  return (await getSessions(es, [current.session_id])).get(current.session_id)?.room ?? null;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const now = getNow(url.searchParams.get("at"));
  const minutes = Math.min(120, Math.max(5, Number(url.searchParams.get("minutes")) || 30));
  try {
    const es = getEs();
    await ensurePlanReady(es);
    const room = url.searchParams.get("room") || (await currentRoom(now));
    return Response.json(await nowNext(es, now, room, minutes));
  } catch (error) {
    console.error("[plan] now/next failed", error);
    return Response.json({ error: "Now / next is unavailable. Is Elasticsearch running?" }, { status: 502 });
  }
}
