import { AGENT_ID } from "./config";
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

/** Asks the Conference Copilot agent through Agent Builder's converse API (the LLM and tool loop run in Kibana). */
export async function askAgent(input: string, conversationId?: string): Promise<AskResponse> {
  const started = Date.now();
  try {
    const res = await kibana<ConverseResult>(
      "POST",
      "/api/agent_builder/converse",
      {
        agent_id: AGENT_ID,
        input,
        ...(conversationId ? { conversation_id: conversationId } : {}),
        ...(process.env.KIBANA_LLM_CONNECTOR_ID ? { connector_id: process.env.KIBANA_LLM_CONNECTOR_ID } : {}),
      },
      { timeoutMs: 120_000 },
    );
    const toolSteps = (res.steps ?? []).filter((s) => s.type === "tool_call" && s.tool_id);
    const steps: AskToolCall[] = toolSteps.map((s) => ({
      toolId: s.tool_id!,
      params: s.params ?? {},
      resultTypes: (s.results ?? []).map((r) => r.type),
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
    if (error instanceof KibanaError && /error calling connector|timeout/i.test(error.message)) {
      return {
        status: "error",
        message: "The copilot's language model didn't answer in time. Try again, or use a faster LLM connector.",
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
