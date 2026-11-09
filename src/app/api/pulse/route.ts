import { getEs } from "@/lib/es/client";
import { getPulse } from "./pulse";

export async function GET() {
  try {
    return Response.json(await getPulse(getEs()));
  } catch (error) {
    console.error("[pulse] failed", error);
    return Response.json({ error: "Pulse is unavailable. Is Elasticsearch running?" }, { status: 502 });
  }
}
