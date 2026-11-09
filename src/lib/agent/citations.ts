import type { AskCitation } from "../types";

interface ToolResult {
  type: string;
  data?: unknown;
}

interface EsqlData {
  columns: { name: string }[];
  values: unknown[][];
}

function isEsql(data: unknown): data is EsqlData {
  return Boolean(data && typeof data === "object" && "columns" in data && "values" in data);
}

/** Collects (id, title) pairs from tool results: ES|QL rows with id/session_id + title, or documents with a title. */
export function collectSessions(results: ToolResult[]): AskCitation[] {
  const found = new Map<string, AskCitation>();
  const add = (id: unknown, title: unknown) => {
    if (typeof title !== "string" || !title.trim()) return;
    const key = typeof id === "string" && id ? id : title;
    if (!found.has(key)) found.set(key, { id: key, title });
  };
  const walk = (node: unknown, depth: number) => {
    if (!node || typeof node !== "object" || depth > 6) return;
    if (Array.isArray(node)) return node.forEach((n) => walk(n, depth + 1));
    const obj = node as Record<string, unknown>;
    if (typeof obj.title === "string") add(obj.id ?? obj.session_id, obj.title);
    for (const v of Object.values(obj)) walk(v, depth + 1);
  };
  for (const r of results) {
    if (isEsql(r.data)) {
      const cols = r.data.columns.map((c) => c.name);
      const t = cols.indexOf("title");
      const i = cols.indexOf("id") >= 0 ? cols.indexOf("id") : cols.indexOf("session_id");
      if (t >= 0) r.data.values.forEach((row) => add(i >= 0 ? row[i] : null, row[t]));
    } else {
      walk(r.data, 0);
    }
  }
  return [...found.values()];
}

/** Sessions the tools returned that the answer actually mentions, in the order they appear in the answer. */
export function extractCitations(answer: string, results: ToolResult[]): AskCitation[] {
  const text = answer.toLowerCase();
  return collectSessions(results)
    .map((c) => ({ c, at: text.indexOf(c.title.toLowerCase()) }))
    .filter((x) => x.at >= 0)
    .sort((a, b) => a.at - b.at)
    .map((x) => x.c);
}
