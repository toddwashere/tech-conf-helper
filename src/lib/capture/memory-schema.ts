import { z } from "zod";

/** What the browser may send to POST /api/memories. The server fills in conference and created_at defaults. */
export const memoryInputSchema = z.object({
  id: z
    .string()
    .min(1)
    .max(200)
    .regex(/^[\w:.-]+$/, "ids may only contain letters, digits, _ : . -"),
  type: z.enum(["transcript", "note", "rating", "contact"]),
  session_id: z.string().min(1).max(200),
  source: z.string().min(1).max(100),
  title: z.string().max(300).nullable().optional(),
  text: z.string().min(1).max(20_000),
  lang: z.string().max(20).nullable().optional(),
  starts_at_ms: z.number().int().min(0).nullable().optional(),
  metadata: z.record(z.string(), z.string().max(500)).optional(),
  created_at: z.iso.datetime({ offset: true }).optional(),
});

const httpUrl = z.url({ protocol: /^https?$/ });

/** Contacts and ratings carry their structure in metadata; check it so nothing malformed reaches ES. */
export const checkedMemorySchema = memoryInputSchema.superRefine((m, ctx) => {
  if (m.type === "contact") {
    if (!m.metadata?.name?.trim()) ctx.addIssue({ code: "custom", message: "A contact needs a name.", path: ["metadata", "name"] });
    const url = m.metadata?.profile_url;
    if (url && !httpUrl.safeParse(url).success) {
      ctx.addIssue({ code: "custom", message: "Profile URL must start with http:// or https://", path: ["metadata", "profile_url"] });
    }
  }
  if (m.type === "rating") {
    const score = Number(m.metadata?.score);
    if (!Number.isInteger(score) || score < 1 || score > 5) {
      ctx.addIssue({ code: "custom", message: "Rating must be 1 to 5.", path: ["metadata", "score"] });
    }
  }
});

export const bulkMemoriesSchema = z.object({
  memories: z.array(checkedMemorySchema).min(1).max(200),
});

export type MemoryInput = z.infer<typeof memoryInputSchema>;
