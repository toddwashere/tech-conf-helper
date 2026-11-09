import { AGENT_ID, EIS_LLMS } from "./config";

// Kibana gives each LLM call 60 s; a slow local model never finishes a multi-step agent run, so give up early.
const ASK_TIMEOUT_MS = Number(process.env.ASK_TIMEOUT_MS ?? 75_000);
import { kibana, KibanaError } from "./kibana";
import { extractCitations } from "./citations";
import type { AskResponse, AskToolCall } from "../types";

interface ConverseStep {
  type: string;
  tool_id?: string;
  params?: Record<string, unknown>;
  results?: { type: string; data?: unknown }[];
}

interface ConverseResult {
  conversation_id?: string;
  steps?: ConverseStep[];
  response?: { message?: string };
}

// Default connector first (set by elastic:setup), then each Elastic Managed LLM when one hits its trial quota (429).
async function converseWithFallback(input: string, conversationId?: string): Promise<ConverseResult> {
  const pinned = process.env.KIBANA_LLM_CONNECTOR_ID;
  const candidates: (string | undefined)[] = [pinned, ...EIS_LLMS.filter((id) => id !== pinned)];
  let lastError: unknown;
  for (const connectorId of candidates) {
    try {
      return await kibana<ConverseResult>(
        "POST",
        "/api/agent_builder/converse",
        {
          agent_id: AGENT_ID,
          input,
          ...(conversationId ? { conversation_id: conversationId } : {}),
          ...(connectorId ? { connector_id: connectorId } : {}),
        },
        { timeoutMs: ASK_TIMEOUT_MS },
      );
    } catch (error) {
      lastError = error;
      const retryable = error instanceof KibanaError && (error.status === 429 || /rate limit|not found|forbidden/i.test(error.message));
      if (!retryable) throw error;
      console.warn(`[ask] ${connectorId ?? "default connector"} unavailable, trying the next LLM`);
    }
  }
  throw lastError;
}

function esqlOf(results: { type: string; data?: unknown }[]): string | null {
  for (const r of results) {
    const d = r.data as { esql?: unknown; query?: unknown } | undefined;
    if (typeof d?.esql === "string") return d.esql;
    if (r.type === "esql_results" && typeof d?.query === "string") return d.query;
  }
  return null;
}

/** Asks the Conference Copilot agent through Agent Builder's converse API (the LLM and tool loop run in Kibana). */
export async function askAgent(input: string, conversationId?: string): Promise<AskResponse> {
  const started = Date.now();
  try {
    const res = await converseWithFallback(input, conversationId);
    const toolSteps = (res.steps ?? []).filter((s) => s.type === "tool_call" && s.tool_id);
    const steps: AskToolCall[] = toolSteps.map((s) => ({
      toolId: s.tool_id!,
      params: s.params ?? {},
      resultTypes: (s.results ?? []).map((r) => r.type),
      esql: esqlOf(s.results ?? []),
    }));
    const answer = res.response?.message ?? "";
    return {
      status: "ok",
      conversationId: res.conversation_id ?? null,
      answer,
      steps,
      citations: extractCitations(answer, toolSteps.flatMap((s) => s.results ?? [])),
      tookMs: Date.now() - started,
    };
  } catch (error) {
    if (error instanceof Error && (error.name === "TimeoutError" || /error calling connector|timeout/i.test(error.message))) {
      return {
        status: "no_llm",
        message: `The agent's language model (Kibana LLM connector) didn't answer within ${Math.round(ASK_TIMEOUT_MS / 1000)} s. A local model is too slow for a multi-step agent; add OPENAI_API_KEY or the Elastic Managed LLM and rerun npm run elastic:setup connector.`,
      };
    }
    if (error instanceof KibanaError && error.status === 429) {
      return {
        status: "no_llm",
        message: "Every Elastic Managed LLM has used its trial quota for now. Ask from Claude Code over MCP instead, or add OPENAI_API_KEY.",
      };
    }
    if (error instanceof KibanaError && /no connector/i.test(error.message)) {
      return {
        status: "no_llm",
        message:
          "Agent Builder has no LLM connector yet. Add OPENAI_API_KEY to .env.local and run npm run elastic:setup connector (or enable the Elastic Managed LLM via Cloud Connect).",
      };
    }
    console.error("[ask] converse failed", error);
    return { status: "error", message: "The copilot couldn't answer. Is Kibana running at KIBANA_URL?" };
  }
}
