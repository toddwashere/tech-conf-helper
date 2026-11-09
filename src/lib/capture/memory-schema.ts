import { z } from "zod";

/** What the browser may send to POST /api/memories. The server fills in conference and created_at defaults. */
export const memoryInputSchema = z.object({
  id: z
    .string()
    .min(1)
    .max(200)
    .regex(/^[\w:.-]+$/, "ids may only contain letters, digits, _ : . -"),
  type: z.enum(["transcript", "note"]),
  session_id: z.string().min(1).max(200),
  source: z.string().min(1).max(100),
  title: z.string().max(300).nullable().optional(),
  text: z.string().min(1).max(20_000),
  lang: z.string().max(20).nullable().optional(),
  starts_at_ms: z.number().int().min(0).nullable().optional(),
  metadata: z.record(z.string(), z.string().max(500)).optional(),
  created_at: z.iso.datetime({ offset: true }).optional(),
});

export const bulkMemoriesSchema = z.object({
  memories: z.array(memoryInputSchema).min(1).max(200),
});

export type MemoryInput = z.infer<typeof memoryInputSchema>;
