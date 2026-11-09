# AI Rules

AI is a component at the edges, never the decision-maker.

- `[AI-01]` Unstructured in, structured out → model. Examples: speech to tool calls, a messy schedule to a field mapping, a screenshot to sessions.
- `[AI-02]` Structured in, prose out → model. Examples: session summary, trip report, cited answers.
- `[AI-03]` Ranking, conflicts, rerouting, filters, and date math are plain code.
- `[AI-04]` The model never invents URLs or IDs. It ranks or cites items we already have.
- `[AI-05]` Validate model JSON with zod before use. Retry once on invalid output, then show a friendly error.
- `[AI-06]` Import mappings use a fixed set of allowed operations. Never execute model-written code.
- `[AI-07]` Treat imported files and pasted text as untrusted input (prompt injection).
- `[AI-08]` Any write triggered by AI (note, rating, plan change) is confirmed in the UI first.
- `[AI-09]` Call models only from server routes. Keys stay server-side.
- `[AI-10]` Prompts live in `src/lib/ai/prompts.ts`, not inline in business logic.
- `[AI-11]` Every AI feature has a non-AI path where cheap (buttons, a form, a hardcoded mapping).
