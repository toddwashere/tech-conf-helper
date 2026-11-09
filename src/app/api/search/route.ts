import { z } from "zod";
import { getEs } from "@/lib/es/client";
import { defaultProfile, searchSessions } from "@/lib/search";

const bodySchema = z.object({
  q: z.string().max(500).default(""),
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  track: z.string().max(200).optional(),
  level: z.string().max(50).optional(),
  includeLogistics: z.boolean().optional(),
  size: z.number().int().min(1).max(100).default(20),
  embeddings: z.enum(["elser", "jina"]).optional(),
  rerank: z.boolean().optional(),
});

export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: "Invalid search request." }, { status: 400 });
  const { q, size, embeddings, rerank, ...filters } = parsed.data;
  try {
    const profile = embeddings ?? defaultProfile();
    // Jina's reranker runs on EIS GPUs (~0.1 s), so it's on by default there; the local CPU reranker stays opt-in.
    const options = { profile, rerank: rerank ?? profile === "jina" };
    return Response.json(await searchSessions(getEs(), q, filters, size, options));
  } catch (error) {
    console.error("[search] failed", error);
    const message = String(error);
    if (embeddings === "jina" && /index_not_found|no such index/.test(message)) {
      return Response.json(
        { error: "Jina embeddings aren't set up yet. Connect Elastic Cloud (EIS) in Kibana, then run npm run elastic:setup." },
        { status: 409 },
      );
    }
    if (rerank && /timeout|inference/i.test(message)) {
      return Response.json(
        { error: "The reranker timed out (it runs on this laptop's CPU). Turn reranking off and try again." },
        { status: 504 },
      );
    }
    return Response.json(
      { error: "Search is unavailable. Is Elasticsearch running and the schedule imported?" },
      { status: 502 },
    );
  }
}
