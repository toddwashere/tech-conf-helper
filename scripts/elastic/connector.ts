import { kibana, KibanaError } from "../../src/lib/agent/kibana";
import { AGENT_ID, EIS_LLMS, OPENAI_CONNECTOR_ID } from "../../src/lib/agent/config";
import { getEs } from "../../src/lib/es/client";

interface Connector {
  id: string;
  name: string;
  connector_type_id: string;
}

const LLM_TYPES = new Set([".gen-ai", ".bedrock", ".gemini", ".inference"]);

/** First Elastic Managed LLM that answers a tiny converse call (skips models whose trial quota is used up). */
async function eisLlm(): Promise<string | null> {
  const res = (await getEs().inference.get({ inference_id: "_all" })) as unknown as { endpoints: { inference_id: string }[] };
  const ids = new Set(res.endpoints.map((e) => e.inference_id));
  for (const id of EIS_LLMS.filter((x) => ids.has(x))) {
    try {
      await kibana("POST", "/api/agent_builder/converse", { agent_id: AGENT_ID, connector_id: id, input: "Reply with OK." }, { timeoutMs: 60_000 });
      return id;
    } catch (error) {
      console.warn(`  ${id} unavailable: ${error instanceof Error ? error.message.slice(0, 120) : error}`);
    }
  }
  return null;
}

/**
 * Returns the LLM connector id for Agent Builder and workflows, in order of preference:
 * KIBANA_LLM_CONNECTOR_ID, the Elastic Managed LLM on EIS, an OpenAI connector from OPENAI_API_KEY, any LLM connector.
 */
export async function ensureLlmConnector(): Promise<{ id: string | null; note: string }> {
  const pinned = process.env.KIBANA_LLM_CONNECTOR_ID;
  if (pinned) {
    await setDefaultConnector(pinned);
    return { id: pinned, note: `using KIBANA_LLM_CONNECTOR_ID=${pinned}` };
  }
  const eis = await eisLlm();
  if (eis) {
    await setDefaultConnector(eis);
    return { id: eis, note: `using the Elastic Managed LLM on EIS: ${eis} (set as Kibana's default AI connector)` };
  }
  const apiKey = process.env.OPENAI_API_KEY;
  const connectors = await kibana<Connector[]>("GET", "/api/actions/connectors");
  if (apiKey) {
    const existing = connectors.some((c) => c.id === OPENAI_CONNECTOR_ID);
    const body = {
      name: "Conference Memory · OpenAI",
      config: {
        apiProvider: "OpenAI",
        apiUrl: "https://api.openai.com/v1/chat/completions",
        defaultModel: process.env.OPENAI_MODEL ?? "gpt-4.1",
      },
      secrets: { apiKey },
    };
    if (existing) await kibana("PUT", `/api/actions/connector/${OPENAI_CONNECTOR_ID}`, body);
    else await kibana("POST", `/api/actions/connector/${OPENAI_CONNECTOR_ID}`, { ...body, connector_type_id: ".gen-ai" });
    await setDefaultConnector(OPENAI_CONNECTOR_ID);
    return { id: OPENAI_CONNECTOR_ID, note: `${existing ? "updated" : "created"} OpenAI connector and made it the default` };
  }
  const other = connectors.find((c) => LLM_TYPES.has(c.connector_type_id));
  if (other) return { id: other.id, note: `using existing LLM connector "${other.name}" ${other.id}` };
  return {
    id: null,
    note: "BLOCKED: no LLM. Connect Elastic Cloud (Cloud Connect) for the Elastic Managed LLM, or put OPENAI_API_KEY in .env.local, then rerun.",
  };
}

async function setDefaultConnector(id: string) {
  try {
    await kibana("POST", "/internal/kibana/settings", { changes: { "genAiSettings:defaultAIConnector": id } });
  } catch (error) {
    if (!(error instanceof KibanaError)) throw error;
    console.warn(`  could not set default AI connector: ${error.message}`);
  }
}
