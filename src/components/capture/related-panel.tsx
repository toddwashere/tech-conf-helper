"use client";

import { useEffect, useState } from "react";
import { QueryInspector } from "@/components/query-inspector";
import type { MemorySearchResult } from "@/lib/capture/memory-search";
import { MemoryHitCard } from "./memory-hit-card";

type State = { kind: "loading" } | { kind: "ready"; result: MemorySearchResult } | { kind: "error"; message: string };

/** Connects this talk to what you wrote in other talks, by meaning (ELSER), not keywords. */
export function RelatedPanel({ sessionId, refreshKey }: { sessionId: string; refreshKey: number }) {
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/sessions/${encodeURIComponent(sessionId)}/related`, { signal: controller.signal })
      .then(async (r) => {
        const body = (await r.json()) as MemorySearchResult & { error?: string };
        if (!r.ok) throw new Error(body.error ?? "Unavailable");
        setState({ kind: "ready", result: body });
      })
      .catch((err: unknown) => {
        if (!controller.signal.aborted) setState({ kind: "error", message: err instanceof Error ? err.message : "Unavailable" });
      });
    return () => controller.abort();
  }, [sessionId, refreshKey]);

  return (
    <section aria-labelledby="related-heading" className="rounded-xl border border-border bg-surface p-4">
      <h2 id="related-heading" className="text-sm font-semibold uppercase tracking-wider text-muted">
        Related from your notes
      </h2>
      <p className="mt-1 text-xs text-muted">What you wrote in other talks that connects to this one, matched by meaning.</p>
      <div className="mt-3" aria-live="polite">
        {state.kind === "loading" && <p className="text-sm text-muted">Looking through your other sessions…</p>}
        {state.kind === "error" && <p className="text-sm text-danger">{state.message}</p>}
        {state.kind === "ready" && (
          <>
            {state.result.hits.length === 0 ? (
              <p className="text-sm text-muted">Nothing yet. Notes from other talks will connect here.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {state.result.hits.map((h) => (
                  <MemoryHitCard key={h.memory.id} hit={h} />
                ))}
              </ul>
            )}
            <QueryInspector traces={state.result.trace} />
          </>
        )}
      </div>
    </section>
  );
}
