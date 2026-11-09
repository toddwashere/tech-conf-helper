import { z } from "zod";
import { getNow, isDemoClock } from "@/lib/clock";
import { getEs } from "@/lib/es/client";
import { ensurePlanReady } from "@/lib/plan/infra";
import { addChoice, getSessions, removeChoice, reorderSlot } from "@/lib/plan/store";
import { buildPlanView } from "@/lib/plan/view";
import type { QueryTrace } from "@/components/query-inspector";
import type { PlanResponse } from "@/lib/types";

const DAY = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const ID = z.string().min(1).max(200);

async function view(day: string | null, at: string | null): Promise<PlanResponse> {
  const es = getEs();
  await ensurePlanReady(es);
  const now = getNow(at);
  const trace: QueryTrace[] = [];
  const slots = await buildPlanView(es, day, now, trace);
  return { now: now.toISOString(), demoClock: isDemoClock(at), day, slots, trace };
}

function fail(scope: string, error: unknown) {
  console.error(`[plan] ${scope} failed`, error);
  return Response.json({ error: "The plan is unavailable. Is Elasticsearch running?" }, { status: 502 });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const day = DAY.safeParse(url.searchParams.get("day"));
  try {
    return Response.json(await view(day.success ? day.data : null, url.searchParams.get("at")));
  } catch (error) {
    return fail("read", error);
  }
}

const addSchema = z.object({ sessionId: ID, reason: z.string().max(500).optional(), day: DAY.optional(), at: z.string().optional() });

export async function POST(request: Request) {
  const parsed = addSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: "Expected { sessionId }." }, { status: 400 });
  try {
    const es = getEs();
    await ensurePlanReady(es);
    const session = (await getSessions(es, [parsed.data.sessionId])).get(parsed.data.sessionId);
    if (!session) return Response.json({ error: "Session not found." }, { status: 404 });
    const doc = await addChoice(es, session, parsed.data.reason);
    return Response.json({ added: doc, plan: await view(parsed.data.day ?? null, parsed.data.at ?? null) });
  } catch (error) {
    return fail("add", error);
  }
}

const reorderSchema = z.object({ slotStart: z.string().min(1), sessionIds: z.array(ID).min(1).max(20), day: DAY.optional(), at: z.string().optional() });

export async function PATCH(request: Request) {
  const parsed = reorderSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: "Expected { slotStart, sessionIds }." }, { status: 400 });
  try {
    await reorderSlot(getEs(), parsed.data.slotStart, parsed.data.sessionIds);
    return Response.json({ plan: await view(parsed.data.day ?? null, parsed.data.at ?? null) });
  } catch (error) {
    return fail("reorder", error);
  }
}

const removeSchema = z.object({ slotStart: z.string().min(1), sessionId: ID, day: DAY.optional(), at: z.string().optional() });

export async function DELETE(request: Request) {
  const parsed = removeSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: "Expected { slotStart, sessionId }." }, { status: 400 });
  try {
    await removeChoice(getEs(), parsed.data.slotStart, parsed.data.sessionId);
    return Response.json({ plan: await view(parsed.data.day ?? null, parsed.data.at ?? null) });
  } catch (error) {
    return fail("remove", error);
  }
}
