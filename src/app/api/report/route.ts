import { generateTripReport } from "@/lib/capture/trip-report";

/** GET: grouped report from memories (no AI). POST: same plus the AI-written narrative when a key is set. */
async function handle(withAi: boolean) {
  try {
    return Response.json(await generateTripReport({ withAi }));
  } catch (error) {
    console.error("[report] failed", error);
    return Response.json({ error: "The trip report is unavailable. Is Elasticsearch running?" }, { status: 502 });
  }
}

export const GET = () => handle(false);
export const POST = () => handle(true);
