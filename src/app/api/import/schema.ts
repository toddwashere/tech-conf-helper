import { z } from "zod";
import { DEFAULT_CONFERENCE } from "@/lib/conference";

export const importBodySchema = z.object({
  urls: z.array(z.url()).min(1).max(10).optional(),
  conference: z.string().regex(/^[a-z0-9-]+$/).optional(),
});

export function resolveImport(body: z.infer<typeof importBodySchema>) {
  return {
    sources: (body.urls ?? [...DEFAULT_CONFERENCE.feeds]).map((url) => ({ url })),
    options: { conference: body.conference ?? DEFAULT_CONFERENCE.id, timeZone: DEFAULT_CONFERENCE.timeZone },
  };
}
