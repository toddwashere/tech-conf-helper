export const AGENT_ID = "conference-copilot";
export const OPENAI_CONNECTOR_ID = "conference-memory-openai";
export const WORKFLOW_IDS = ["session-ended", "trip-report", "room-full"] as const;

// Elastic Managed LLMs on EIS (after Cloud Connect), best first. Trial quotas are per model, so on a 429 the app
// falls back to the next one. Agent Builder and workflow AI steps accept these inference ids as connector ids.
export const EIS_LLMS = [
  ".anthropic-claude-5-sonnet-chat_completion",
  ".gp-llm-v2-chat_completion",
  ".anthropic-claude-4.5-sonnet-chat_completion",
  ".moonshot-kimi-k3-chat_completion",
  ".zai-glm-5.3-chat_completion",
] as const;
