// Thin client for the Kibana HTTP APIs we use (Agent Builder, Workflows, saved objects, connectors).
// Kibana accepts the same Elasticsearch API key as `Authorization: ApiKey ...`.

export const KIBANA_URL = process.env.KIBANA_URL ?? "http://localhost:5601";

export class KibanaError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: unknown,
  ) {
    super(message);
  }
}

function authHeader(): Record<string, string> {
  const apiKey = process.env.ES_API_KEY;
  if (apiKey) return { Authorization: `ApiKey ${apiKey}` };
  const user = process.env.ES_USERNAME;
  const pass = process.env.ES_PASSWORD;
  if (user && pass) return { Authorization: `Basic ${Buffer.from(`${user}:${pass}`).toString("base64")}` };
  return {};
}

export async function kibana<T = unknown>(
  method: "GET" | "POST" | "PUT" | "DELETE",
  path: string,
  body?: unknown,
  opts: { timeoutMs?: number; allow404?: boolean } = {},
): Promise<T> {
  const res = await fetch(`${KIBANA_URL}${path}`, {
    method,
    headers: {
      ...authHeader(),
      "kbn-xsrf": "true",
      "x-elastic-internal-origin": "conference-memory",
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(opts.timeoutMs ?? 60_000),
  });
  const text = await res.text();
  let parsed: unknown = text;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    // keep raw text
  }
  if (res.status === 404 && opts.allow404) return null as T;
  if (!res.ok) {
    const msg =
      parsed && typeof parsed === "object" && "message" in parsed ? String(parsed.message) : text.slice(0, 300);
    throw new KibanaError(`${method} ${path} -> ${res.status}: ${msg}`, res.status, parsed);
  }
  return parsed as T;
}
