import { z } from "zod";
import { askAgent } from "@/lib/agent/converse";

const bodySchema = z.object({
  input: z.string().trim().min(1).max(2000),
  conversationId: z.string().max(200).optional(),
});

export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ status: "error", message: "Ask a question first." }, { status: 400 });
  const result = await askAgent(parsed.data.input, parsed.data.conversationId);
  return Response.json(result, { status: result.status === "error" ? 502 : 200 });
}
