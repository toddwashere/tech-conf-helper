import { readFileSync } from "node:fs";
import { join } from "node:path";
import { kibana } from "../../src/lib/agent/kibana";
import { WORKFLOW_IDS } from "../../src/lib/agent/config";

interface ValidateResult {
  results: { data: { result: { valid: boolean; diagnostics: unknown[] } } }[];
}

export function workflowYaml(id: string): string {
  return readFileSync(join(__dirname, "workflows", `${id}.yaml`), "utf8");
}

export async function validateWorkflow(yaml: string): Promise<{ valid: boolean; diagnostics: unknown[] }> {
  const res = await kibana<ValidateResult>("POST", "/api/agent_builder/tools/_execute", {
    tool_id: "platform.workflows.validate_workflow",
    tool_params: { yaml },
  });
  return res.results[0].data.result;
}

/** Validates each workflow YAML, then creates it (or updates it in place) with a stable id. */
export async function ensureWorkflows(): Promise<string[]> {
  const out: string[] = [];
  for (const id of WORKFLOW_IDS) {
    const yaml = workflowYaml(id);
    const check = await validateWorkflow(yaml);
    if (!check.valid) throw new Error(`workflow ${id} is invalid: ${JSON.stringify(check.diagnostics)}`);
    const existing = await kibana("GET", `/api/workflows/workflow/${id}`, undefined, { allow404: true });
    if (existing) {
      await kibana("PUT", `/api/workflows/workflow/${id}`, { yaml });
      out.push(`${id} updated`);
    } else {
      await kibana("POST", "/api/workflows", { workflows: [{ id, yaml }] });
      out.push(`${id} created`);
    }
  }
  return out;
}
