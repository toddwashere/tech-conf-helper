import { z } from "zod";
import { bulkSaveMemories, listSessionMemories } from "@/lib/capture/memories";
import { bulkMemoriesSchema } from "@/lib/capture/memory-schema";
import { getEs } from "@/lib/es/client";

export async function POST(request: Request) {
  const parsed = bulkMemoriesSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "Invalid memories payload.", issues: z.treeifyError(parsed.error) }, { status: 400 });
  }
  try {
    const result = await bulkSaveMemories(getEs(), parsed.data.memories);
    return Response.json(result, { status: result.failed.length ? 207 : 200 });
  } catch (error) {
    console.error("[memories] bulk failed", error);
    return Response.json({ error: "Couldn't save to Elasticsearch right now." }, { status: 502 });
  }
}

const listSchema = z.object({
  session_id: z.string().min(1).max(200),
  type: z.enum(["transcript", "note", "summary"]).array().min(1),
});

export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = listSchema.safeParse({
    session_id: url.searchParams.get("session_id") ?? "",
    type: url.searchParams.getAll("type").length ? url.searchParams.getAll("type") : ["transcript", "note", "summary"],
  });
  if (!parsed.success) return Response.json({ error: "Pass session_id and optional type." }, { status: 400 });
  try {
    const memories = await listSessionMemories(getEs(), parsed.data.session_id, parsed.data.type);
    return Response.json({ memories });
  } catch (error) {
    console.error("[memories] list failed", error);
    return Response.json({ error: "Couldn't read memories right now." }, { status: 502 });
  }
}
