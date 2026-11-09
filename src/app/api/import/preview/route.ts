import { getEs } from "@/lib/es/client";
import { previewSessionize } from "@/lib/import/run";
import { importBodySchema, resolveImport } from "../schema";

export async function POST(request: Request) {
  const parsed = importBodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return Response.json({ error: "Send { urls: string[] } with Sessionize feed URLs." }, { status: 400 });
  }
  const { sources, options } = resolveImport(parsed.data);
  try {
    return Response.json(await previewSessionize(getEs(), sources, options));
  } catch (error) {
    console.error("[import preview] failed", error);
    const message = error instanceof Error ? error.message : "Preview failed";
    return Response.json({ error: message }, { status: 502 });
  }
}
