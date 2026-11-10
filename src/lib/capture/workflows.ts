import type { QueryTrace } from "@/components/query-inspector";
import { kibana, KIBANA_URL } from "@/lib/agent/kibana";

// Runs an Elastic Workflow (Kibana) and waits for it. WS-C owns the workflow YAML in scripts/elastic/workflows/;
// the app only triggers it and reads what it wrote to `memories`.

export const WORKFLOW_LABEL = "Summarized by Elastic Workflows + Elastic Managed LLM";

const DONE = new Set(["completed", "failed", "cancelled", "timed_out", "skipped"]);

interface RunResponse {
  workflowExecutionId?: string;
  executionId?: string;
  id?: string;
}

interface ExecutionStatus {
  status: string;
  duration?: number | null;
  error?: unknown;
}

export interface WorkflowRun {
  ok: boolean;
  executionId: string | null;
  status: string;
  durationMs: number;
  error: string | null;
  trace: QueryTrace;
}

export async function runWorkflowAndWait(
  workflowId: string,
  inputs: Record<string, string>,
  { timeoutMs = 90_000, pollMs = 1000 }: { timeoutMs?: number; pollMs?: number } = {},
): Promise<WorkflowRun> {
  const started = Date.now();
  const path = `/api/workflows/workflow/${workflowId}/run`;
  const trace = (status: string, executionId: string | null): QueryTrace => ({
    label: `Elastic Workflow "${workflowId}" (${status})`,
    features: ["Elastic Workflows", "elasticsearch.search step", "ai.prompt step", "Elastic Managed LLM"],
    index: `${KIBANA_URL}${path}`,
    request: { method: "POST", path, body: { inputs }, execution: executionId },
    tookMs: Date.now() - started,
  });

  let executionId: string | null = null;
  try {
    const run = await kibana<RunResponse>("POST", path, { inputs }, { timeoutMs: 45_000 });
    executionId = run.workflowExecutionId ?? run.executionId ?? run.id ?? null;
    if (!executionId) throw new Error(`Unexpected run response: ${JSON.stringify(run).slice(0, 200)}`);
    while (Date.now() - started < timeoutMs) {
      await new Promise((r) => setTimeout(r, pollMs));
      const exec = await kibana<ExecutionStatus>("GET", `/api/workflows/executions/${executionId}`, undefined, { timeoutMs: 10_000 });
      if (DONE.has(exec.status)) {
        const ok = exec.status === "completed";
        const error = ok ? null : exec.error ? JSON.stringify(exec.error).slice(0, 300) : exec.status;
        return { ok, executionId, status: exec.status, durationMs: Date.now() - started, error, trace: trace(exec.status, executionId) };
      }
    }
    return { ok: false, executionId, status: "timeout", durationMs: Date.now() - started, error: "Timed out waiting for the workflow", trace: trace("timeout", executionId) };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, executionId, status: "error", durationMs: Date.now() - started, error: message, trace: trace("error", executionId) };
  }
}
