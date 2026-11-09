import { kibana, KibanaError } from "../../src/lib/agent/kibana";
import { OPENAI_CONNECTOR_ID } from "../../src/lib/agent/config";

interface Connector {
  id: string;
  name: string;
  connector_type_id: string;
}

const LLM_TYPES = new Set([".gen-ai", ".bedrock", ".gemini", ".inference"]);

/** Returns the id of a usable LLM connector, creating the OpenAI one from OPENAI_API_KEY when possible. */
export async function ensureLlmConnector(): Promise<{ id: string | null; note: string }> {
  const apiKey = process.env.OPENAI_API_KEY;
  const connectors = await kibana<Connector[]>("GET", "/api/actions/connectors");
  const existing = connectors.find((c) => c.id === OPENAI_CONNECTOR_ID);
  const body = {
    name: "Conference Memory · OpenAI",
    config: {
      apiProvider: "OpenAI",
      apiUrl: "https://api.openai.com/v1/chat/completions",
      defaultModel: process.env.OPENAI_MODEL ?? "gpt-4.1",
    },
    secrets: { apiKey },
  };
  if (apiKey) {
    if (existing) await kibana("PUT", `/api/actions/connector/${OPENAI_CONNECTOR_ID}`, body);
    else await kibana("POST", `/api/actions/connector/${OPENAI_CONNECTOR_ID}`, { ...body, connector_type_id: ".gen-ai" });
    await setDefaultConnector(OPENAI_CONNECTOR_ID);
    return { id: OPENAI_CONNECTOR_ID, note: `${existing ? "updated" : "created"} OpenAI connector and made it the default` };
  }
  const other = connectors.find((c) => LLM_TYPES.has(c.connector_type_id));
  if (other) return { id: other.id, note: `using existing LLM connector ${other.name}` };
  return {
    id: null,
    note: "BLOCKED: no LLM connector. Put OPENAI_API_KEY in .env.local (or connect Elastic Cloud for the Elastic Managed LLM) and rerun.",
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
