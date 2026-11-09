import { z } from "zod";
import { getEs } from "@/lib/es/client";
import { ensurePlanReady } from "@/lib/plan/infra";
import { clearSignals } from "@/lib/plan/signals";
import { clearPlan } from "@/lib/plan/store";

const schema = z.object({ signals: z.boolean().default(true), plan: z.boolean().default(false) });

/** Demo reset: clears room signals (and optionally the plan). */
export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: "Invalid reset request." }, { status: 400 });
  try {
    const es = getEs();
    await ensurePlanReady(es);
    const deletedSignals = parsed.data.signals ? await clearSignals(es) : 0;
    if (parsed.data.plan) await clearPlan(es);
    return Response.json({ deletedSignals, clearedPlan: parsed.data.plan });
  } catch (error) {
    console.error("[plan] reset failed", error);
    return Response.json({ error: "Reset failed. Is Elasticsearch running?" }, { status: 502 });
  }
}
