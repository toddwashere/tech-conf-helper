"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { formatDayInZone, formatTimeInZone } from "@/lib/time";
import type { SearchMeta, SearchResponse, SessionDoc } from "@/lib/types";
import { DEFAULT_ENGINE, SearchEngineToggle } from "./search-engine-toggle";

const CONFERENCE_TZ = "America/Denver";

const DAYS = [
  { value: "", label: "All days" },
  { value: "2026-11-09", label: "Mon Nov 9" },
  { value: "2026-11-10", label: "Tue Nov 10" },
  { value: "2026-11-11", label: "Wed Nov 11" },
  { value: "2026-11-12", label: "Thu Nov 12" },
];

const EXAMPLES = ["something on eBPF and security", "running LLM inference on Kubernetes", "platform engineering for small teams"];

type Status = "idle" | "loading" | "ready" | "error";

export function SessionSearch() {
  const [query, setQuery] = useState("");
  const [day, setDay] = useState("");
  const [submitted, setSubmitted] = useState({ query: "", day: "" });
  const [status, setStatus] = useState<Status>("idle");
  const [result, setResult] = useState<(SearchResponse & Partial<SearchMeta>) | null>(null);
  const [engine, setEngine] = useState(DEFAULT_ENGINE);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    async function run() {
      setStatus("loading");
      setError(null);
      try {
        const res = await fetch("/api/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ q: submitted.query, day: submitted.day || undefined, ...engine }),
          signal: controller.signal,
        });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? "Search failed");
        setResult(body as SearchResponse);
        setStatus("ready");
      } catch (err) {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : "Search failed");
        setStatus("error");
      }
    }
    run();
    return () => controller.abort();
  }, [submitted, engine]);

  function submit(nextQuery = query) {
    setQuery(nextQuery);
    setSubmitted({ query: nextQuery, day });
  }

  return (
    <section>
      <form
        className="flex flex-col gap-2 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <input
          aria-label="Search sessions"
          className="flex-1 rounded-lg border border-border bg-surface px-4 py-3 text-base outline-none placeholder:text-muted focus:border-accent"
          placeholder="Try “something on eBPF and security”"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select
          aria-label="Day"
          className="rounded-lg border border-border bg-surface px-3 py-3"
          value={day}
          onChange={(e) => {
            setDay(e.target.value);
            setSubmitted({ query, day: e.target.value });
          }}
        >
          {DAYS.map((d) => (
            <option key={d.value} value={d.value}>
              {d.label}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="rounded-lg bg-accent-strong px-5 py-3 font-medium text-background hover:bg-accent"
        >
          Search
        </button>
      </form>

      <div className="mt-3 flex flex-wrap gap-2 text-sm">
        {EXAMPLES.map((ex) => (
          <button
            key={ex}
            type="button"
            onClick={() => submit(ex)}
            className="rounded-full border border-border px-3 py-1 text-muted hover:border-accent hover:text-foreground"
          >
            {ex}
          </button>
        ))}
      </div>

      <SearchEngineToggle value={engine} onChange={setEngine} meta={result} />

      <div className="mt-6" aria-live="polite">
        {status === "loading" && <p className="text-muted">Searching…</p>}
        {status === "error" && (
          <p className="rounded-lg border border-danger/40 bg-danger/10 p-4 text-danger">{error}</p>
        )}
        {status === "ready" && result && result.hits.length === 0 && (
          <p className="rounded-lg border border-border bg-surface p-6 text-muted">
            No sessions found. Try a broader phrase, or import the schedule first with <code>npm run import</code>.
          </p>
        )}
        {status === "ready" && result && result.hits.length > 0 && (
          <>
            <p className="mb-3 text-sm text-muted">
              {submitted.query ? `${result.total} matches, best first` : `${result.total} sessions, in time order`}
            </p>
            <ul className="flex flex-col gap-3">
              {result.hits.map(({ session }) => (
                <SessionCard key={session.id} session={session} />
              ))}
            </ul>
          </>
        )}
      </div>
    </section>
  );
}

function SessionCard({ session }: { session: SessionDoc }) {
  const place = [session.building, session.room].filter(Boolean).join(" · ");
  return (
    <li className="rounded-xl border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
        <span className="font-medium text-accent">
          {formatDayInZone(session.starts_at, CONFERENCE_TZ)} · {formatTimeInZone(session.starts_at, CONFERENCE_TZ)}–
          {formatTimeInZone(session.ends_at, CONFERENCE_TZ)}
        </span>
        <span>{place}</span>
        {session.full && <span className="rounded bg-warn/15 px-2 py-0.5 text-warn">Full</span>}
        <AddToPlan sessionId={session.id} />
      </div>
      <h2 className="mt-1 text-lg font-semibold leading-snug">
        <Link href={`/session/${encodeURIComponent(session.id)}`} className="hover:text-accent hover:underline">
          {session.title}
        </Link>
      </h2>
      {session.speaker_names.length > 0 && <p className="text-sm text-muted">{session.speaker_names.join(", ")}</p>}
      {session.description && <p className="mt-2 line-clamp-3 text-sm text-foreground/80">{session.description}</p>}
      <div className="mt-3 flex flex-wrap gap-2 text-xs">
        {[...session.tracks, ...(session.level ? [session.level] : [])].map((t) => (
          <span key={t} className="rounded-full bg-surface-2 px-2 py-1 text-muted">
            {t}
          </span>
        ))}
      </div>
    </li>
  );
}

type AddState = { status: "idle" | "adding" | "error" } | { status: "added"; label: string };

function AddToPlan({ sessionId }: { sessionId: string }) {
  const [state, setState] = useState<AddState>({ status: "idle" });

  async function add() {
    setState({ status: "adding" });
    try {
      const res = await fetch("/api/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error);
      setState({ status: "added", label: `Plan ${String.fromCharCode(65 + (body.added?.rank ?? 0))}` });
    } catch {
      setState({ status: "error" });
    }
  }

  if (state.status === "added") {
    return (
      <Link href="/plan" className="ml-auto rounded-lg bg-accent/15 px-3 py-1 text-accent hover:underline">
        Added as {state.label} · view plan
      </Link>
    );
  }
  return (
    <button
      type="button"
      onClick={add}
      disabled={state.status === "adding"}
      className="ml-auto rounded-lg border border-accent/60 px-3 py-1 text-accent hover:bg-accent/10 disabled:opacity-50"
    >
      {state.status === "adding" ? "Adding…" : state.status === "error" ? "Retry add" : "+ Add to plan"}
    </button>
  );
}
