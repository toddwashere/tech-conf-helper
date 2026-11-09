import { z } from "zod";
import { getEs } from "@/lib/es/client";
import { resetDemo, seedDemoPlan } from "@/lib/plan/demo";
import { ensurePlanReady } from "@/lib/plan/infra";
import { clearSignals } from "@/lib/plan/signals";

const schema = z.object({
  /** "signals": clear app-written room signals only. "demo": restore the seeded demo plan. "empty": clear plan and signals. */
  mode: z.enum(["signals", "demo", "empty"]).default("signals"),
});

/** Demo reset. Simulated history in `room-signals` is always kept. */
export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: "Invalid reset request." }, { status: 400 });
  try {
    const es = getEs();
    await ensurePlanReady(es);
    if (parsed.data.mode === "signals") return Response.json({ mode: "signals", deletedSignals: await clearSignals(es) });
    if (parsed.data.mode === "empty") await resetDemo(es);
    else await seedDemoPlan(es);
    return Response.json({ mode: parsed.data.mode });
  } catch (error) {
    console.error("[plan] reset failed", error);
    return Response.json({ error: "Reset failed. Is Elasticsearch running?" }, { status: 502 });
  }
}
