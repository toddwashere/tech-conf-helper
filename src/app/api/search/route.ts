import { z } from "zod";
import { getEs } from "@/lib/es/client";
import { searchSessions } from "@/lib/search";

const bodySchema = z.object({
  q: z.string().max(500).default(""),
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  track: z.string().max(200).optional(),
  level: z.string().max(50).optional(),
  includeLogistics: z.boolean().optional(),
  size: z.number().int().min(1).max(100).default(20),
});

export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: "Invalid search request." }, { status: 400 });
  const { q, size, ...filters } = parsed.data;
  try {
    return Response.json(await searchSessions(getEs(), q, filters, size));
  } catch (error) {
    console.error("[search] failed", error);
    return Response.json(
      { error: "Search is unavailable. Is Elasticsearch running and the schedule imported?" },
      { status: 502 },
    );
  }
}
