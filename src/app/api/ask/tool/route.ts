import { z } from "zod";
import { DIRECT_TOOLS, runTool } from "@/lib/agent/tools";

const bodySchema = z.object({
  toolId: z.enum(DIRECT_TOOLS),
  params: z.record(z.string(), z.union([z.string(), z.number()])).default({}),
});

export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: "Unknown tool." }, { status: 400 });
  try {
    return Response.json(await runTool(parsed.data.toolId, parsed.data.params));
  } catch (error) {
    console.error("[ask/tool] failed", error);
    return Response.json({ error: "The tool failed. Did npm run elastic:setup run?" }, { status: 502 });
  }
}
