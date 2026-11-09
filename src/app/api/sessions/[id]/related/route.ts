import { relatedMemories } from "@/lib/capture/memory-search";
import { decodeSessionId, getSessionById } from "@/lib/capture/session";
import { getEs } from "@/lib/es/client";

export async function GET(_request: Request, ctx: RouteContext<"/api/sessions/[id]/related">) {
  const id = decodeSessionId((await ctx.params).id);
  try {
    const es = getEs();
    const session = await getSessionById(es, id);
    if (!session) return Response.json({ error: "We couldn't find that session." }, { status: 404 });
    return Response.json(await relatedMemories(es, session));
  } catch (error) {
    console.error("[related] failed", error);
    return Response.json({ error: "Related memories are unavailable right now." }, { status: 502 });
  }
}
