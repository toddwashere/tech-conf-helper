"use client";

import { useState } from "react";

export interface QueryTrace {
  /** What this query does, in plain words, e.g. "Hybrid search: keyword + ELSER semantic, merged with RRF". */
  label: string;
  /** Elastic features used, shown as chips, e.g. ["RRF", "semantic_text", "geo_distance"]. */
  features?: string[];
  /** The request body sent to Elasticsearch (Query DSL object or an ES|QL string). */
  request: unknown;
  index?: string;
  tookMs?: number | null;
}

/** Collapsible "Show the Elasticsearch query" panel. API routes return `trace: QueryTrace[]` alongside their data. */
export function QueryInspector({ traces }: { traces: QueryTrace[] | undefined | null }) {
  const [open, setOpen] = useState(false);
  if (!traces || traces.length === 0) return null;
  return (
    <div className="mt-3 rounded-lg border border-border bg-surface/60 text-sm">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-muted hover:text-foreground"
      >
        <span>
          {open ? "Hide" : "Show"} the Elasticsearch {traces.length === 1 ? "query" : `queries (${traces.length})`}
        </span>
        <span className="font-mono text-xs">
          {traces
            .map((t) => t.tookMs)
            .filter((t): t is number => typeof t === "number")
            .reduce((a, b) => a + b, 0) || ""}
          {traces.some((t) => typeof t.tookMs === "number") ? " ms" : ""}
        </span>
      </button>
      {open && (
        <ol className="flex flex-col gap-3 border-t border-border p-3">
          {traces.map((t, i) => (
            <li key={i}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-foreground">{t.label}</span>
                {t.index && <span className="font-mono text-xs text-muted">{t.index}</span>}
                {typeof t.tookMs === "number" && <span className="font-mono text-xs text-accent">{t.tookMs} ms</span>}
              </div>
              {t.features && t.features.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-1">
                  {t.features.map((f) => (
                    <span key={f} className="rounded bg-accent/15 px-1.5 py-0.5 font-mono text-xs text-accent">
                      {f}
                    </span>
                  ))}
                </div>
              )}
              <pre className="mt-2 max-h-72 overflow-auto rounded bg-background p-2 font-mono text-xs leading-relaxed text-foreground/80">
                {typeof t.request === "string" ? t.request : JSON.stringify(t.request, null, 2)}
              </pre>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
