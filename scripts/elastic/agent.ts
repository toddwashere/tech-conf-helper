import { kibana, KibanaError } from "../../src/lib/agent/kibana";
import { AGENT_ID } from "../../src/lib/agent/config";

interface ToolDef {
  id: string;
  type: "esql" | "index_search" | "workflow";
  description: string;
  configuration: Record<string, unknown>;
  /** Created only if this index exists (it's owned by another workstream and may not be there yet). */
  requiresIndex?: string;
}

export const TOOLS: ToolDef[] = [
  {
    id: "cc.sessions_in_window",
    type: "esql",
    description:
      "List conference talks starting in a time window. Use for 'what's on now', 'what's next', 'what's at 2pm Tuesday'. Times are ISO-8601 UTC; the conference is in America/Denver (UTC-7).",
    configuration: {
      query:
        'FROM sessions | WHERE kind == "talk" AND starts_at >= ?from AND starts_at < ?to | KEEP id, title, starts_at, ends_at, room, building, tracks, speaker_names, full | SORT starts_at, room | LIMIT 60',
      params: {
        from: { type: "date", description: "Window start, ISO-8601 UTC, e.g. 2026-11-10T21:00:00Z" },
        to: { type: "date", description: "Window end, ISO-8601 UTC" },
      },
    },
  },
  {
    id: "cc.my_plan",
    type: "esql",
    description:
      "The attendee's saved plan: one row per time slot and choice. the lowest rank (0) is the first choice, higher ranks are backups. Joins session titles and rooms with an enrich policy.",
    configuration: {
      query:
        "FROM plans | ENRICH conference-sessions-by-id ON session_id WITH title, room, building, starts_at | SORT slot_start, rank | KEEP slot_start, slot_end, rank, title, room, building, session_id, reason | LIMIT 200",
      params: {},
    },
  },
  {
    id: "cc.room_status",
    type: "esql",
    description:
      "Live room status from crowd signals (full, crowded, checkin) in the room-signals time-series data stream over the last few hours. Use before recommending a talk that may be full.",
    requiresIndex: "room-signals",
    configuration: {
      query:
        "FROM room-signals | WHERE @timestamp > NOW() - 4 hours | STATS signals = COUNT(*), last_seen = MAX(@timestamp) BY room, building, signal | SORT last_seen DESC | LIMIT 50",
      params: {},
    },
  },
  {
    id: "cc.track_mix",
    type: "esql",
    description: "How many talks each track has, optionally for one day (YYYY-MM-DD). Good for 'what is this conference about'.",
    configuration: {
      query:
        'FROM sessions | WHERE kind == "talk" AND (?day == "" OR day == ?day) | STATS talks = COUNT(*) BY tracks | SORT talks DESC | LIMIT 25',
      params: { day: { type: "string", description: "Day as YYYY-MM-DD, or empty string for all days" } },
    },
  },
  {
    id: "cc.search_sessions",
    type: "index_search",
    description:
      "Hybrid semantic + keyword search over the whole conference schedule (titles, abstracts, speakers, topics). Use to find talks about a subject.",
    configuration: { pattern: "sessions" },
  },
  {
    id: "cc.search_memories",
    type: "index_search",
    description:
      "Search what the attendee captured: live transcripts, their own notes, and talk summaries (field `type`). Use for 'what did I learn about X', 'what did the speaker say about Y'.",
    configuration: { pattern: "memories" },
  },
  {
    id: "cc.session_ended",
    type: "workflow",
    description:
      "Run the session-ended workflow: summarizes a talk's transcript and notes and saves a summary memory. Input: session_id.",
    configuration: { workflow_id: "session-ended", wait_for_completion: true },
  },
  {
    id: "cc.trip_report",
    type: "workflow",
    description: "Run the trip-report workflow: writes a Markdown trip report from all summaries and notes and saves it.",
    configuration: { workflow_id: "trip-report", wait_for_completion: true },
  },
  {
    id: "cc.room_full",
    type: "workflow",
    description:
      "Run the room-full workflow when the attendee says a room is full: records the signal and returns the next backup from their plan. Input: session_id.",
    configuration: { workflow_id: "room-full", wait_for_completion: true },
  },
];

export const INSTRUCTIONS = `You are Conference Copilot for KubeCon + CloudNativeCon North America 2026 in Salt Lake City (Salt Palace Convention Center).
The attendee is at the conference right now. Be brief and practical; they're reading on a phone between talks.

Data you can use (all in Elasticsearch):
- sessions: the full schedule. Times are stored in UTC; always show times in Mountain Time (America/Denver, UTC-7) like "2:30 PM".
- plans: the attendee's plan, rank 0 first choice, then backups (tool cc.my_plan).
- room-signals: live crowd signals per room (tool cc.room_status).
- memories: transcripts, notes, summaries, trip reports the attendee captured (tool cc.search_memories).

Rules:
- Use tools for facts; never invent talks, rooms, or times.
- When you mention a talk, use its exact title in **bold**.
- For "now/next" questions convert Mountain Time to UTC before calling cc.sessions_in_window.
- If the attendee says a room is full, call cc.room_full with that session id and offer the backup it returns.
- For "what did I learn" questions, search memories first, then fill gaps from sessions.`;

async function existsIndex(index: string): Promise<boolean> {
  const { getEs } = await import("../../src/lib/es/client");
  return getEs().indices.exists({ index });
}

export async function ensureTools(): Promise<{ created: string[]; skipped: string[] }> {
  const created: string[] = [];
  const skipped: string[] = [];
  for (const { requiresIndex, ...tool } of TOOLS) {
    if (requiresIndex && !(await existsIndex(requiresIndex))) {
      skipped.push(`${tool.id} (needs ${requiresIndex})`);
      continue;
    }
    const existing = await kibana("GET", `/api/agent_builder/tools/${tool.id}`, undefined, { allow404: true });
    const { id, type, ...rest } = tool;
    try {
      if (existing) await kibana("PUT", `/api/agent_builder/tools/${id}`, { ...rest, tags: ["conference-memory"] });
      else await kibana("POST", "/api/agent_builder/tools", { id, type, ...rest, tags: ["conference-memory"] });
      created.push(id);
    } catch (error) {
      if (!(error instanceof KibanaError)) throw error;
      skipped.push(`${id} (${error.message})`);
    }
  }
  return { created, skipped };
}

export async function ensureAgent(toolIds: string[]): Promise<string> {
  const body = {
    name: "Conference Copilot",
    description: "Plans your KubeCon, reroutes when rooms fill up, and remembers every talk you saw.",
    labels: ["conference-memory"],
    avatar_color: "#0B64DD",
    avatar_symbol: "CC",
    configuration: {
      instructions: INSTRUCTIONS,
      tools: [{ tool_ids: [...toolIds, "platform.core.execute_esql", "platform.core.get_document_by_id"] }],
    },
  };
  const existing = await kibana("GET", `/api/agent_builder/agents/${AGENT_ID}`, undefined, { allow404: true });
  if (existing) {
    await kibana("PUT", `/api/agent_builder/agents/${AGENT_ID}`, body);
    return `agent ${AGENT_ID} updated with ${toolIds.length} custom tools`;
  }
  await kibana("POST", "/api/agent_builder/agents", { id: AGENT_ID, ...body });
  return `agent ${AGENT_ID} created with ${toolIds.length} custom tools`;
}
