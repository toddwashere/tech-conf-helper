import { kibana } from "./kibana";

// Read-only ES|QL tools the Ask page may run directly (no LLM needed). Workflow tools stay agent-only.
export const DIRECT_TOOLS = ["cc.sessions_in_window", "cc.my_plan", "cc.room_status", "cc.track_mix"] as const;
export type DirectTool = (typeof DIRECT_TOOLS)[number];

export interface ToolTable {
  query: string | null;
  columns: string[];
  rows: unknown[][];
}

interface ExecuteResult {
  results: { type: string; data: { esql?: string; query?: string; columns?: { name: string }[]; values?: unknown[][] } }[];
}

/** Runs an Agent Builder tool through `/api/agent_builder/tools/_execute` and returns its ES|QL table. */
export async function runTool(toolId: DirectTool, params: Record<string, unknown>): Promise<ToolTable> {
  const res = await kibana<ExecuteResult>("POST", "/api/agent_builder/tools/_execute", {
    tool_id: toolId,
    tool_params: params,
  });
  const table = res.results.find((r) => r.type === "esql_results");
  if (!table) {
    const err = res.results.find((r) => r.type === "error");
    throw new Error(err ? JSON.stringify(err.data).slice(0, 300) : "tool returned no table");
  }
  return {
    query: table.data.query ?? null,
    columns: (table.data.columns ?? []).map((c) => c.name),
    rows: table.data.values ?? [],
  };
}
