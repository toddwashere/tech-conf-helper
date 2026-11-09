// Idempotent setup of everything Conference Memory uses on the Elastic platform:
// enrich policy, room-signals stream, LLM connector, workflows, Agent Builder tools + agent, Kibana dashboard, Jina index.
// Run with `npm run elastic:setup`. Each step reports and the script keeps going if one fails.
import { getEs } from "../../src/lib/es/client";
import { ensureAgent, ensureTools } from "./agent";
import { ensureLlmConnector } from "./connector";
import { ensureDashboard } from "./dashboard";
import { ensureRoomSignals, ensureSessionsEnrich } from "./infra";
import { ensureJina } from "./jina";
import { ensureWorkflows } from "./workflows";

const only = process.argv.slice(2);

async function step(name: string, fn: () => Promise<string | string[]>) {
  if (only.length && !only.includes(name)) return;
  const started = Date.now();
  try {
    const out = await fn();
    for (const line of Array.isArray(out) ? out : [out]) console.log(`✓ ${name}: ${line}`);
  } catch (error) {
    console.log(`✗ ${name}: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  } finally {
    if (Date.now() - started > 3000) console.log(`  (${((Date.now() - started) / 1000).toFixed(1)} s)`);
  }
}

async function main() {
  const es = getEs();
  await step("enrich", () => ensureSessionsEnrich(es));
  await step("signals", () => ensureRoomSignals(es));
  await step("connector", async () => (await ensureLlmConnector()).note);
  await step("workflows", ensureWorkflows);
  await step("agent", async () => {
    const tools = await ensureTools();
    return [
      `tools: ${tools.created.join(", ")}`,
      ...tools.skipped.map((s) => `skipped tool ${s}`),
      await ensureAgent(tools.created),
    ];
  });
  await step("dashboard", () => ensureDashboard(es));
  await step("jina", () => ensureJina(es));
}

main();
