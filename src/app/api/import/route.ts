import { getEs } from "@/lib/es/client";
import { importSessionize } from "@/lib/import/run";
import type { ImportStreamEvent } from "@/lib/types";
import { importBodySchema, resolveImport } from "./schema";

export async function POST(request: Request) {
  const parsed = importBodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return Response.json({ error: "Send { urls: string[] } with Sessionize feed URLs." }, { status: 400 });
  }
  const { sources, options } = resolveImport(parsed.data);
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: ImportStreamEvent) => controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      try {
        const result = await importSessionize(getEs(), sources, options, (p) => send({ type: "progress", ...p }));
        send({ type: "done", result });
      } catch (error) {
        console.error("[import] failed", error);
        send({ type: "error", error: error instanceof Error ? error.message : "Import failed" });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson", "Cache-Control": "no-store" } });
}
