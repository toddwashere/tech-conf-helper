"use client";

import { useState } from "react";
import { VoiceInput } from "@/components/capture/voice-input";
import { QueryInspector } from "@/components/query-inspector";
import type { AskResponse } from "@/lib/types";
import { Markdown } from "./markdown";

const SUGGESTIONS = [
  "What's on Tuesday at 2:50 PM?",
  "What's my plan for Tuesday afternoon?",
  "My 2:50 talk on Tuesday is full. Where should I go instead?",
  "What did I learn about eBPF?",
  "Write my trip report for my manager.",
];

// Run without an LLM: the same Agent Builder tools, executed directly.
// Verified with Claude Code: tools/list shows the 9 cc_* tools and cc_track_mix returns live data.
// Single quotes keep ${ES_API_KEY} as a reference that Claude Code expands at runtime, so the key isn't saved in config.
const MCP_COMMAND = `claude mcp add --transport http conference-memory "http://localhost:5601/api/agent_builder/mcp?namespace=cc" --header 'Authorization: ApiKey \${ES_API_KEY}'`;

const DIRECT: { label: string; toolId: string; params: Record<string, string> }[] = [
  { label: "Talks Tue 2:50–3:20 PM", toolId: "cc.sessions_in_window", params: { from: "2026-11-10T21:50:00Z", to: "2026-11-10T22:20:00Z" } },
  { label: "My plan", toolId: "cc.my_plan", params: {} },
  { label: "Room status", toolId: "cc.room_status", params: {} },
  { label: "Track mix Tuesday", toolId: "cc.track_mix", params: { day: "2026-11-10" } },
];

interface Turn {
  question: string;
  reply: AskResponse | null;
}

interface ToolTable {
  toolId: string;
  query: string | null;
  columns: string[];
  rows: unknown[][];
}

export function AskChat() {
  const [input, setInput] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [table, setTable] = useState<ToolTable | null>(null);
  const [tableError, setTableError] = useState<string | null>(null);

  const noLlm = turns.some((t) => t.reply?.status === "no_llm");

  async function ask(question: string, fresh = false) {
    if (!question.trim() || busy) return;
    setBusy(true);
    setInput("");
    setTurns((t) => [...t, { question, reply: null }]);
    let reply: AskResponse;
    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: question, conversationId, fresh }),
      });
      reply = (await res.json()) as AskResponse;
    } catch {
      reply = { status: "error", message: "Couldn't reach the server." };
    }
    if (reply.status === "ok" && reply.conversationId) setConversationId(reply.conversationId);
    setTurns((t) => t.map((turn, i) => (i === t.length - 1 ? { ...turn, reply } : turn)));
    setBusy(false);
  }

  async function runDirect(toolId: string, params: Record<string, string>) {
    setTableError(null);
    setTable(null);
    try {
      const res = await fetch("/api/ask/tool", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toolId, params }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Tool failed");
      setTable({ toolId, ...body });
    } catch (err) {
      setTableError(err instanceof Error ? err.message : "Tool failed");
    }
  }

  return (
    <section className="flex flex-col gap-4">
      {turns.length === 0 && (
        <div className="flex flex-wrap gap-2 text-sm">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => ask(s)}
              className="rounded-full border border-border px-3 py-1 text-left text-muted hover:border-accent hover:text-foreground"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      <ol className="flex flex-col gap-4" aria-live="polite">
        {turns.map((turn, i) => (
          <li key={i} className="flex flex-col gap-2">
            <p className="self-end rounded-2xl bg-accent-strong/20 px-4 py-2">{turn.question}</p>
            <Reply reply={turn.reply} onAskLive={() => ask(turn.question, true)} />
          </li>
        ))}
      </ol>

      <form
        className="sticky bottom-0 -mx-1 flex gap-2 bg-background px-1 py-3"
        onSubmit={(e) => {
          e.preventDefault();
          ask(input);
        }}
      >
        <input
          aria-label="Ask the copilot"
          className="min-w-0 flex-1 rounded-lg border border-border bg-surface px-4 py-3 outline-none placeholder:text-muted focus:border-accent"
          placeholder="Ask about talks, your plan, or what you learned"
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />
        <VoiceInput onText={(t) => ask(t)} label="Talk" className="shrink-0" />
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-accent-strong px-5 py-3 font-medium text-background hover:bg-accent disabled:opacity-50"
        >
          {busy ? "…" : "Ask"}
        </button>
      </form>

      {noLlm && <McpCard />}

      <details className="rounded-xl border border-border bg-surface p-4" open={noLlm}>
        <summary className="cursor-pointer text-sm font-medium">Run the agent&apos;s tools directly (no LLM)</summary>
        <p className="mt-2 text-sm text-muted">
          These are the copilot&apos;s ES|QL tools, executed by Agent Builder with no language model in the loop.
        </p>
        <div className="mt-3 flex flex-wrap gap-2 text-sm">
          {DIRECT.map((d) => (
            <button
              key={d.label}
              type="button"
              onClick={() => runDirect(d.toolId, d.params)}
              className="rounded-full border border-border px-3 py-1 text-muted hover:border-accent hover:text-foreground"
            >
              {d.label}
            </button>
          ))}
        </div>
        {tableError && <p className="mt-3 text-sm text-danger">{tableError}</p>}
        {table && <ToolTableView table={table} />}
      </details>
    </section>
  );
}

function Reply({ reply, onAskLive }: { reply: AskResponse | null; onAskLive: () => void }) {
  if (!reply) return <p className="text-muted">Thinking with Agent Builder…</p>;
  if (reply.status === "no_llm")
    return <p className="rounded-lg border border-warn/40 bg-warn/10 p-4 text-sm text-warn">{reply.message}</p>;
  if (reply.status === "error")
    return <p className="rounded-lg border border-danger/40 bg-danger/10 p-4 text-sm text-danger">{reply.message}</p>;
  return (
    <div className="rounded-2xl border border-border bg-surface p-4">
      <Markdown text={reply.answer || "(no answer)"} />
      <UnderTheHood reply={reply} onAskLive={onAskLive} />
      <QueryInspector
        traces={reply.steps.map((s) => ({
          label: `Tool ${s.toolId}`,
          features: s.esql ? ["Agent Builder", "ES|QL"] : ["Agent Builder", ...s.resultTypes],
          request: s.esql ?? s.params,
        }))}
      />
      {reply.citations.length > 0 && (
        <div className="mt-3 border-t border-border pt-2 text-sm">
          <p className="text-xs uppercase tracking-wider text-muted">Sessions cited</p>
          <ul className="mt-1 flex flex-col gap-0.5">
            {reply.citations.map((c) => (
              <li key={c.id} className="text-accent">
                {c.title}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function ToolTableView({ table }: { table: ToolTable }) {
  return (
    <div className="mt-3">
      <p className="font-mono text-xs text-muted">{table.toolId}</p>
      {table.query && (
        <QueryInspector traces={[{ label: `Tool ${table.toolId}`, features: ["Agent Builder", "ES|QL", "tools/_execute"], request: table.query }]} />
      )}
      {table.rows.length === 0 ? (
        <p className="mt-2 text-sm text-muted">No rows.</p>
      ) : (
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="text-muted">
              <tr>
                {table.columns.map((c) => (
                  <th key={c} className="px-2 py-1 font-medium">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.slice(0, 30).map((row, i) => (
                <tr key={i} className="border-t border-border">
                  {row.map((v, j) => (
                    <td key={j} className="px-2 py-1 align-top">
                      {Array.isArray(v) ? v.join(", ") : String(v ?? "")}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function McpCard() {
  const [copied, setCopied] = useState(false);
  return (
    <div className="rounded-xl border border-accent/40 bg-accent/10 p-4 text-sm">
      <p className="font-medium">Ask from Claude Code instead (MCP)</p>
      <p className="mt-1 text-muted">
        The same agent tools are served by Agent Builder over MCP, so Claude can be the language model. Run this with{" "}
        <code>ES_API_KEY</code> exported, then ask Claude about the conference:
      </p>
      <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-all rounded bg-background p-2 font-mono text-xs">{MCP_COMMAND}</pre>
      <button
        type="button"
        onClick={() => {
          navigator.clipboard?.writeText(MCP_COMMAND).then(() => setCopied(true));
        }}
        className="mt-2 rounded border border-border px-3 py-1 text-xs text-muted hover:border-accent hover:text-foreground"
      >
        {copied ? "Copied" : "Copy command"}
      </button>
    </div>
  );
}

type OkReply = Extract<AskResponse, { status: "ok" }>;

function llmLabel(reply: OkReply): string {
  const u = reply.usage;
  if (!u) return "Kibana default LLM";
  const id = u.connectorId ?? "";
  const managed = id.startsWith(".") ? "Elastic Managed LLM on EIS" : "Kibana connector";
  return `${u.model ?? id} (${managed})`;
}

/** Two lines that show the Elastic machinery behind an answer: which LLM, how many calls, which tools. */
function UnderTheHood({ reply, onAskLive }: { reply: OkReply; onAskLive: () => void }) {
  const u = reply.usage;
  const tokens = u?.inputTokens ? `${(u.inputTokens / 1000).toFixed(1)}k tokens in` : null;
  return (
    <div className="mt-3 rounded-lg border border-border bg-surface-2/60 px-3 py-2 text-xs text-muted">
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="font-medium text-foreground">Elastic under the hood</span>
        <span>Agent Builder · conference-copilot</span>
        <span>·</span>
        <span>{llmLabel(reply)}</span>
        {u?.llmCalls ? <span>· {u.llmCalls} LLM calls</span> : null}
        {tokens && <span>· {tokens}</span>}
      </p>
      <p className="mt-1 flex flex-wrap items-center gap-1.5">
        <span>Tools:</span>
        {reply.steps.length === 0 && <span>none</span>}
        {reply.steps.map((s, i) => (
          <span key={i} className="rounded bg-accent/15 px-1.5 py-0.5 font-mono text-accent">
            {s.toolId}
          </span>
        ))}
        <span>· {(reply.tookMs / 1000).toFixed(1)} s</span>
        {reply.cachedAt && (
          <>
            <span
              className="rounded bg-warn/15 px-1.5 py-0.5 font-mono text-warn"
              title={`Answer cached in the ask-cache index at ${new Date(reply.cachedAt).toLocaleTimeString()}`}
            >
              cached
            </span>
            <button type="button" onClick={onAskLive} className="underline hover:text-foreground">
              ask live
            </button>
          </>
        )}
      </p>
    </div>
  );
}
