import { z } from "zod";
import { DEFAULT_CONFERENCE } from "@/lib/conference";
import { getEs } from "@/lib/es/client";
import { importSessionize } from "@/lib/import/run";

const bodySchema = z.object({
  urls: z.array(z.url()).min(1).max(10).optional(),
  conference: z.string().regex(/^[a-z0-9-]+$/).optional(),
});

export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return Response.json({ error: "Send { urls: string[] } with Sessionize feed URLs." }, { status: 400 });
  }
  const urls = parsed.data.urls ?? [...DEFAULT_CONFERENCE.feeds];
  try {
    const result = await importSessionize(
      getEs(),
      urls.map((url) => ({ url })),
      { conference: parsed.data.conference ?? DEFAULT_CONFERENCE.id, timeZone: DEFAULT_CONFERENCE.timeZone },
    );
    return Response.json(result);
  } catch (error) {
    console.error("[import] failed", error);
    const message = error instanceof Error ? error.message : "Import failed";
    return Response.json({ error: message }, { status: 502 });
  }
}
