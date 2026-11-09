import { z } from "zod";
import { SEARCHABLE_TYPES, searchMemories } from "@/lib/capture/memory-search";
import { getEs } from "@/lib/es/client";

const bodySchema = z.object({
  q: z.string().max(500).default(""),
  types: z.array(z.enum(SEARCHABLE_TYPES)).max(5).optional(),
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  size: z.number().int().min(1).max(50).default(20),
});

export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: "Invalid memory search." }, { status: 400 });
  try {
    return Response.json(await searchMemories(getEs(), parsed.data));
  } catch (error) {
    console.error("[memories/search] failed", error);
    return Response.json({ error: "Memory search is unavailable. Is Elasticsearch running?" }, { status: 502 });
  }
}
