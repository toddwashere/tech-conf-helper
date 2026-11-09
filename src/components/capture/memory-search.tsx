"use client";

import { useEffect, useState } from "react";
import { QueryInspector } from "@/components/query-inspector";
import { SEARCHABLE_TYPES, type MemorySearchResult, type SearchableType } from "@/lib/capture/memory-search";
import { MemoryHitCard, TYPE_LABEL } from "./memory-hit-card";

const DAYS = [
  { value: "", label: "Any day" },
  { value: "2026-11-10", label: "Tue Nov 10" },
  { value: "2026-11-11", label: "Wed Nov 11" },
  { value: "2026-11-12", label: "Thu Nov 12" },
];

const EXAMPLES = ["what should we try on our cluster", "GPU cost", "who should I follow up with"];

type State = { kind: "loading" } | { kind: "ready"; result: MemorySearchResult } | { kind: "error"; message: string };

export function MemorySearch() {
  const [q, setQ] = useState("");
  const [types, setTypes] = useState<SearchableType[]>([]);
  const [day, setDay] = useState("");
  const [submitted, setSubmitted] = useState({ q: "", types: [] as SearchableType[], day: "" });
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/memories/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ q: submitted.q, types: submitted.types.length ? submitted.types : undefined, day: submitted.day || undefined, size: 10 }),
      signal: controller.signal,
    })
      .then(async (r) => {
        const body = (await r.json()) as MemorySearchResult & { error?: string };
        if (!r.ok) throw new Error(body.error ?? "Search failed");
        setState({ kind: "ready", result: body });
      })
      .catch((err: unknown) => {
        if (!controller.signal.aborted) setState({ kind: "error", message: err instanceof Error ? err.message : "Search failed" });
      });
    return () => controller.abort();
  }, [submitted]);

  function run(next: Partial<typeof submitted> = {}) {
    setState({ kind: "loading" });
    setSubmitted({ q, types, day, ...next });
  }

  function toggleType(t: SearchableType) {
    const next = types.includes(t) ? types.filter((x) => x !== t) : [...types, t];
    setTypes(next);
    run({ types: next });
  }

  return (
    <section aria-labelledby="memory-search-heading" className="rounded-xl border border-border bg-surface p-4">
      <h2 id="memory-search-heading" className="text-sm font-semibold uppercase tracking-wider text-muted">
        Search my memories
      </h2>
      <form
        className="mt-3 flex flex-col gap-2 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          run();
        }}
      >
        <input
          aria-label="Search your notes, transcripts, summaries, ratings and people"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by meaning, e.g. “what should we try on our cluster”"
          className="flex-1 rounded-lg border border-border bg-background px-3 py-2.5 outline-none placeholder:text-muted focus:border-accent"
        />
        <select
          aria-label="Day"
          value={day}
          onChange={(e) => {
            setDay(e.target.value);
            run({ day: e.target.value });
          }}
          className="rounded-lg border border-border bg-background px-3 py-2.5"
        >
          {DAYS.map((d) => (
            <option key={d.value} value={d.value}>
              {d.label}
            </option>
          ))}
        </select>
        <button type="submit" className="rounded-lg bg-accent-strong px-4 py-2.5 font-medium text-background hover:bg-accent">
          Search
        </button>
      </form>
      <div className="mt-2 flex flex-wrap gap-2 text-xs" role="group" aria-label="Filter by type">
        {SEARCHABLE_TYPES.map((t) => (
          <button
            key={t}
            type="button"
            aria-pressed={types.includes(t)}
            onClick={() => toggleType(t)}
            className={`rounded-full border px-2.5 py-1 ${types.includes(t) ? "border-accent bg-accent/15 text-accent" : "border-border text-muted hover:border-accent"}`}
          >
            {TYPE_LABEL[t]}
          </button>
        ))}
        <span className="mx-1 text-border">|</span>
        {EXAMPLES.map((ex) => (
          <button
            key={ex}
            type="button"
            onClick={() => {
              setQ(ex);
              run({ q: ex });
            }}
            className="rounded-full border border-border px-2.5 py-1 text-muted hover:border-accent hover:text-foreground"
          >
            {ex}
          </button>
        ))}
      </div>

      <div className="mt-3" aria-live="polite">
        {state.kind === "loading" && <p className="text-sm text-muted">Searching your memories…</p>}
        {state.kind === "error" && <p className="rounded-lg border border-danger/40 bg-danger/10 p-3 text-sm text-danger">{state.message}</p>}
        {state.kind === "ready" && (
          <>
            {state.result.hits.length === 0 ? (
              <p className="text-sm text-muted">No memories match. Try different words or clear the filters.</p>
            ) : (
              <>
                <p className="mb-2 text-xs text-muted">
                  {submitted.q ? `Best ${state.result.hits.length} of ${state.result.total} matches` : "Latest memories"}
                </p>
                <ul className="flex flex-col gap-2">
                  {state.result.hits.map((h) => (
                    <MemoryHitCard key={h.memory.id} hit={h} />
                  ))}
                </ul>
              </>
            )}
            <QueryInspector traces={state.result.trace} />
          </>
        )}
      </div>
    </section>
  );
}
