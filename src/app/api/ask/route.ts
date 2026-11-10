import { z } from "zod";
import { cacheAnswer, getCachedAnswer } from "@/lib/agent/cache";
import { askAgent } from "@/lib/agent/converse";
import { getEs } from "@/lib/es/client";

const bodySchema = z.object({
  input: z.string().trim().min(1).max(2000),
  conversationId: z.string().max(200).optional(),
  /** Skip the cache and run the agent live. */
  fresh: z.boolean().optional(),
});

export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ status: "error", message: "Ask a question first." }, { status: 400 });
  const { input, conversationId, fresh } = parsed.data;
  const es = getEs();

  // Follow-ups depend on the conversation, so only first questions are served from (and saved to) the cache.
  if (!fresh && !conversationId) {
    const cached = await getCachedAnswer(es, input);
    if (cached) return Response.json(cached);
  }
  const result = await askAgent(input, conversationId);
  if (result.status === "ok" && !conversationId) {
    await cacheAnswer(es, input, result).catch((error) => console.warn("[ask] cache write failed", error));
  }
  return Response.json(result, { status: result.status === "error" ? 502 : 200 });
}
