import { getNow } from "@/lib/clock";
import { getEs } from "@/lib/es/client";
import { ensurePlanReady } from "@/lib/plan/infra";
import { roomActivity } from "@/lib/plan/signals";
import type { QueryTrace } from "@/components/query-inspector";

/** Room-signal activity for a day up to the demo clock: date_histogram × signal, plus the busiest rooms. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const day = url.searchParams.get("day") ?? "2026-11-10";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return Response.json({ error: "Invalid day." }, { status: 400 });
  try {
    const es = getEs();
    await ensurePlanReady(es);
    const trace: QueryTrace[] = [];
    const activity = await roomActivity(es, day, getNow(url.searchParams.get("at")), trace);
    return Response.json({ ...activity, trace });
  } catch (error) {
    console.error("[plan] activity failed", error);
    return Response.json({ error: "Room activity is unavailable." }, { status: 502 });
  }
}
