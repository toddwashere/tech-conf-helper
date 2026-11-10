"use client";

import { useEffect, useState } from "react";
import { QueryInspector, type QueryTrace } from "@/components/query-inspector";
import type { MemoryDoc, SessionSummary, SummarizeResult } from "@/lib/types";

// "saved" = a summary not made by either path here (e.g. seeded demo data); labeled neutrally.
type Mode = "workflow" | "ai" | "extractive" | "saved";

const MODE_LABEL: Record<Mode, string> = {
  workflow: "Summarized by Elastic Workflows + Elastic Managed LLM",
  ai: "AI summary (OpenAI)",
  extractive: "Highlights (no AI)",
  saved: "Summary",
};

type State =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ready"; summary: SessionSummary; fromCache: boolean; mode: Mode; notice: string | null; trace: QueryTrace[] }
  | { kind: "notice"; message: string; tone: "info" | "error" };

function fromMemory(m: MemoryDoc): SessionSummary | null {
  try {
    const md = m.metadata ?? {};
    return {
      one_line: md.one_line ?? "",
      takeaways: JSON.parse(md.takeaways ?? "[]") as string[],
      action_items: JSON.parse(md.action_items ?? "[]") as string[],
    };
  } catch {
    return null;
  }
}

export function SummaryPanel({ sessionId, beforeSummarize }: { sessionId: string; beforeSummarize: () => Promise<void> }) {
  const [state, setState] = useState<State>({ kind: "idle" });

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/memories?session_id=${encodeURIComponent(sessionId)}&type=summary`, { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((body: { memories?: MemoryDoc[] } | null) => {
        const memory = body?.memories?.[0];
        const summary = memory ? fromMemory(memory) : null;
        if (memory && summary) {
          const mode: Mode =
            memory.source === "extractive"
              ? "extractive"
              : memory.source.startsWith("workflow:")
                ? "workflow"
                : memory.source.startsWith("openai:")
                  ? "ai"
                  : "saved";
          setState({ kind: "ready", summary, fromCache: true, mode, notice: null, trace: [] });
        }
      })
      .catch(() => {});
    return () => controller.abort();
  }, [sessionId]);

  async function summarize() {
    setState({ kind: "loading" });
    try {
      await beforeSummarize();
      const res = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/summarize`, { method: "POST" });
      const result = (await res.json()) as SummarizeResult & { trace?: QueryTrace[] };
      if (result.status === "ok") {
        setState({
          kind: "ready",
          summary: result.summary,
          fromCache: false,
          mode: result.mode ?? "ai",
          notice: result.notice ?? null,
          trace: result.trace ?? [],
        });
      }
      else setState({ kind: "notice", message: result.message, tone: result.status === "error" ? "error" : "info" });
    } catch {
      setState({ kind: "notice", message: "Summary failed. Check your connection and try again.", tone: "error" });
    }
  }

  return (
    <section aria-labelledby="summary-heading" className="rounded-xl border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 id="summary-heading" className="mr-auto text-sm font-semibold uppercase tracking-wider text-muted">
          Session summary
        </h2>
        <button
          type="button"
          onClick={summarize}
          disabled={state.kind === "loading"}
          className="rounded-lg bg-accent-strong px-4 py-2 text-sm font-medium text-background hover:bg-accent disabled:opacity-50"
        >
          {state.kind === "loading" ? "Summarizing…" : state.kind === "ready" ? "Summarize again" : "Summarize session"}
        </button>
      </div>

      <div className="mt-3" aria-live="polite">
        {state.kind === "idle" && (
          <p className="text-sm text-muted">When the talk ends, turn the captions and your notes into takeaways and action items.</p>
        )}
        {state.kind === "loading" && (
          <div className="flex flex-col gap-2" aria-label="Summarizing">
            <p className="text-sm text-muted">Running the session-ended Elastic Workflow over your transcript and notes…</p>
            <div className="h-4 w-3/4 animate-pulse rounded bg-surface-2" />
            <div className="h-4 w-2/3 animate-pulse rounded bg-surface-2" />
            <div className="h-4 w-1/2 animate-pulse rounded bg-surface-2" />
          </div>
        )}
        {state.kind === "notice" && (
          <p
            className={`rounded-lg border p-3 text-sm ${
              state.tone === "error" ? "border-danger/40 bg-danger/10 text-danger" : "border-accent/40 bg-accent/10 text-accent"
            }`}
          >
            {state.message}
          </p>
        )}
        {state.kind === "ready" && (
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`rounded px-2 py-0.5 text-xs font-semibold ${
                  state.mode === "extractive" ? "bg-warn/15 text-warn" : "bg-emerald-500/15 text-emerald-400"
                }`}
              >
                {MODE_LABEL[state.mode]}
              </span>
              {state.notice && <span className="text-xs text-muted">{state.notice}</span>}
            </div>
            <p className="text-base">{state.summary.one_line}</p>
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">
                {state.mode === "extractive" ? "Key moments" : "Takeaways"}
              </h3>
              <ul className="mt-1 list-disc pl-5 text-sm leading-relaxed">
                {state.summary.takeaways.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            </div>
            {state.summary.action_items.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">Action items</h3>
                <ul className="mt-1 list-disc pl-5 text-sm leading-relaxed">
                  {state.summary.action_items.map((a) => (
                    <li key={a}>{a}</li>
                  ))}
                </ul>
              </div>
            )}
            <p className="text-xs text-muted">{state.fromCache ? "Saved summary" : "Saved to memories"}</p>
            <QueryInspector traces={state.trace} />
          </div>
        )}
      </div>
    </section>
  );
}
