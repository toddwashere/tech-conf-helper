import { decodeSessionId } from "@/lib/capture/session";
import { summarizeSession } from "@/lib/capture/summarize";

export async function POST(_request: Request, ctx: RouteContext<"/api/sessions/[id]/summarize">) {
  const id = decodeSessionId((await ctx.params).id);
  try {
    const result = await summarizeSession(id);
    const status = result.status === "ok" ? 200 : result.status === "error" ? 502 : 200;
    return Response.json(result, { status });
  } catch (error) {
    console.error("[summarize] failed", error);
    return Response.json({ status: "error", message: "Summary failed. Is Elasticsearch running?" }, { status: 502 });
  }
}
