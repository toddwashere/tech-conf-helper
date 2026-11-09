import { getSessionById, decodeSessionId } from "@/lib/capture/session";
import { getEs } from "@/lib/es/client";

export async function GET(_request: Request, ctx: RouteContext<"/api/sessions/[id]">) {
  const id = decodeSessionId((await ctx.params).id);
  try {
    const session = await getSessionById(getEs(), id);
    if (!session) return Response.json({ error: "We couldn't find that session." }, { status: 404 });
    return Response.json({ session });
  } catch (error) {
    console.error("[sessions] get failed", error);
    return Response.json({ error: "Session details are unavailable. Is Elasticsearch running?" }, { status: 502 });
  }
}
