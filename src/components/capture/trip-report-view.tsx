"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { formatDayInZone, formatTimeInZone } from "@/lib/time";
import type { TripReport, TripReportSession } from "@/lib/types";

const TZ = "America/Denver";

type Load = { kind: "loading" } | { kind: "ready"; report: TripReport } | { kind: "error"; message: string };

async function fetchReport(withAi: boolean): Promise<TripReport> {
  const res = await fetch("/api/report", { method: withAi ? "POST" : "GET" });
  const body = (await res.json()) as TripReport & { error?: string };
  if (!res.ok) throw new Error(body.error ?? "Report unavailable");
  return body;
}

export function TripReportView() {
  const [load, setLoad] = useState<Load>({ kind: "loading" });
  const [writing, setWriting] = useState(false);

  useEffect(() => {
    let active = true;
    fetchReport(false)
      .then((report) => active && setLoad({ kind: "ready", report }))
      .catch((err: unknown) => active && setLoad({ kind: "error", message: err instanceof Error ? err.message : "Report unavailable" }));
    return () => {
      active = false;
    };
  }, []);

  async function writeWithAi() {
    setWriting(true);
    try {
      setLoad({ kind: "ready", report: await fetchReport(true) });
    } catch (err) {
      setLoad({ kind: "error", message: err instanceof Error ? err.message : "Report unavailable" });
    } finally {
      setWriting(false);
    }
  }

  if (load.kind === "loading") return <p className="text-muted">Gathering everything you captured…</p>;
  if (load.kind === "error") return <p className="rounded-lg border border-danger/40 bg-danger/10 p-4 text-danger">{load.message}</p>;

  const { report } = load;
  const c = report.counts;
  if (!c.sessions) {
    return (
      <p className="rounded-xl border border-border bg-surface p-6 text-muted">
        Nothing captured yet. Open a talk from <Link href="/" className="text-accent underline">search</Link>, then add notes,
        a rating, or people you met. They show up here, grouped by day.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <p className="mr-auto text-sm text-muted">
          {[
            plural(c.sessions, "session"),
            plural(c.notes, "note"),
            plural(c.ratings, "rating"),
            plural(c.contacts, "person", "people"),
            plural(c.summaries, "summary", "summaries"),
          ].join(" · ")}
        </p>
        <button
          type="button"
          onClick={writeWithAi}
          disabled={writing}
          className="rounded-lg bg-accent-strong px-4 py-2 text-sm font-medium text-background hover:bg-accent disabled:opacity-50"
        >
          {writing ? "Writing…" : report.ai ? "Rewrite with AI" : "Write it up with AI"}
        </button>
      </div>

      {report.aiMessage && (
        <p
          className={`rounded-lg border p-3 text-sm ${
            report.aiStatus === "missing_key" ? "border-accent/40 bg-accent/10 text-accent" : "border-warn/40 bg-warn/10 text-warn"
          }`}
        >
          {report.aiMessage}
        </p>
      )}

      {report.ai && (
        <section className="rounded-xl border border-accent/40 bg-surface p-5">
          <p className="text-lg font-medium">{report.ai.headline}</p>
          <List title="Highlights" items={report.ai.highlights} />
          {report.ai.top_talks.length > 0 && (
            <div className="mt-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">Share with the team</h3>
              <ul className="mt-1 list-disc pl-5 text-sm leading-relaxed">
                {report.ai.top_talks.map((t) => (
                  <li key={t.session_id}>
                    <Link href={`/session/${encodeURIComponent(t.session_id)}`} className="text-accent hover:underline">
                      {t.title}
                    </Link>{" "}
                    · {t.why}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <List title="Follow up with" items={report.ai.follow_ups} />
          <List title="Next steps" items={report.ai.next_steps} />
        </section>
      )}

      {report.days.map((d) => (
        <section key={d.day}>
          <h2 className="text-xl font-semibold">{formatDayInZone(`${d.day}T12:00:00-07:00`, TZ)}</h2>
          <ul className="mt-3 flex flex-col gap-3">
            {d.sessions.map((s) => (
              <SessionEntry key={s.id} s={s} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

function List({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div className="mt-4">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">{title}</h3>
      <ul className="mt-1 list-disc pl-5 text-sm leading-relaxed">
        {items.map((i) => (
          <li key={i}>{i}</li>
        ))}
      </ul>
    </div>
  );
}

function SessionEntry({ s }: { s: TripReportSession }) {
  const linkable = Boolean(s.starts_at);
  return (
    <li className="rounded-xl border border-border bg-surface p-4">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        {s.starts_at && <span className="text-sm text-accent">{formatTimeInZone(s.starts_at, TZ)}</span>}
        <h3 className="font-semibold">
          {linkable ? (
            <Link href={`/session/${encodeURIComponent(s.id)}`} className="hover:text-accent hover:underline">
              {s.title}
            </Link>
          ) : (
            s.title
          )}
        </h3>
        {s.room && <span className="text-sm text-muted">{s.room}</span>}
        {s.rating && (
          <span className="ml-auto rounded-full bg-accent/15 px-2 py-0.5 text-sm text-accent" aria-label={`Rated ${s.rating.score} of 5`}>
            {"★".repeat(s.rating.score)}
            <span className="opacity-30">{"★".repeat(5 - s.rating.score)}</span>
          </span>
        )}
      </div>
      {s.rating?.reason && <p className="mt-1 text-sm italic text-muted">“{s.rating.reason}”</p>}
      {s.summary && <p className="mt-2 whitespace-pre-line text-sm leading-relaxed">{s.summary}</p>}
      {s.notes.length > 0 && (
        <ul className="mt-2 list-disc pl-5 text-sm leading-relaxed text-foreground/90">
          {s.notes.map((n, i) => (
            <li key={i}>{n}</li>
          ))}
        </ul>
      )}
      {s.contacts.length > 0 && (
        <div className="mt-2 text-sm">
          <span className="text-muted">Met: </span>
          {s.contacts.map((p, i) => (
            <span key={i}>
              {i > 0 && ", "}
              {p.profile_url ? (
                <a href={p.profile_url} target="_blank" rel="noreferrer noopener" className="text-accent hover:underline">
                  {p.name}
                </a>
              ) : (
                <span className="font-medium">{p.name}</span>
              )}
              {p.role && <span className="text-muted"> ({p.role})</span>}
              {p.follow_up && <span> · follow up: {p.follow_up}</span>}
            </span>
          ))}
        </div>
      )}
    </li>
  );
}
