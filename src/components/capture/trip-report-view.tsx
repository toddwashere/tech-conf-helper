"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { formatDayInZone, formatTimeInZone } from "@/lib/time";
import { QueryInspector, type QueryTrace } from "@/components/query-inspector";
import type { TripReport, TripReportGlance, TripReportSession } from "@/lib/types";
import { SimpleMarkdown } from "./simple-markdown";

const TZ = "America/Denver";

type Report = TripReport & { trace?: QueryTrace[] };
type Load = { kind: "loading" } | { kind: "ready"; report: Report } | { kind: "error"; message: string };

async function fetchReport(withAi: boolean): Promise<Report> {
  const res = await fetch("/api/report", { method: withAi ? "POST" : "GET" });
  const body = (await res.json()) as Report & { error?: string };
  if (!res.ok) throw new Error(body.error ?? "Report unavailable");
  return body;
}

export function TripReportView() {
  const [load, setLoad] = useState<Load>({ kind: "loading" });
  const [writing, setWriting] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    fetchReport(false)
      .then((report) => active && setLoad({ kind: "ready", report }))
      .catch((err: unknown) => active && setLoad({ kind: "error", message: err instanceof Error ? err.message : "Report unavailable" }));
    return () => {
      active = false;
    };
  }, [attempt]);

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

  if (load.kind === "loading") {
    return (
      <div className="flex flex-col gap-3" aria-label="Loading trip report">
        <p className="text-muted">Gathering everything you captured…</p>
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-24 animate-pulse rounded-xl bg-surface" />
        ))}
      </div>
    );
  }
  if (load.kind === "error") {
    return (
      <div className="rounded-lg border border-danger/40 bg-danger/10 p-4 text-danger">
        <p>{load.message}</p>
        <button
          type="button"
          onClick={() => {
            setLoad({ kind: "loading" });
            setAttempt((a) => a + 1);
          }}
          className="mt-2 rounded-lg border border-danger/60 px-3 py-1.5 text-sm hover:bg-danger/10"
        >
          Try again
        </button>
      </div>
    );
  }

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
          {writing ? "Elastic Workflow is writing…" : report.narrative || report.ai ? "Rewrite the report" : "Write the report"}
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

      {report.narrative && (
        <section aria-labelledby="narrative-heading" className="rounded-xl border border-emerald-500/30 bg-surface p-5">
          <div className="flex flex-wrap items-center gap-2">
            <h2 id="narrative-heading" className="mr-auto text-sm font-semibold uppercase tracking-wider text-emerald-400">
              Written report
            </h2>
            <span className="rounded bg-emerald-500/15 px-2 py-0.5 text-xs font-semibold text-emerald-400">
              {report.narrative.source.startsWith("workflow:")
                ? "Summarized by Elastic Workflows + Elastic Managed LLM"
                : report.narrative.source}
            </span>
            <span className="text-xs text-muted">
              {formatDayInZone(report.narrative.created_at, TZ)} {formatTimeInZone(report.narrative.created_at, TZ)}
            </span>
          </div>
          <div className="mt-3">
            <SimpleMarkdown markdown={report.narrative.markdown} />
          </div>
        </section>
      )}
      <QueryInspector traces={report.trace} />

      <Glance glance={report.glance} />

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

function Glance({ glance }: { glance: TripReportGlance }) {
  const { topTalks, actions, followUps } = glance;
  if (!topTalks.length && !actions.length && !followUps.length) return null;
  return (
    <section aria-labelledby="glance-heading" className="rounded-xl border border-accent/30 bg-surface p-5">
      <h2 id="glance-heading" className="text-sm font-semibold uppercase tracking-wider text-accent">
        At a glance
      </h2>
      <div className="mt-4 grid grid-cols-1 gap-6 [&>*]:min-w-0 md:grid-cols-3">
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">Top talks</h3>
          {topTalks.length === 0 ? (
            <p className="mt-2 text-sm text-muted">Rate talks to rank them here.</p>
          ) : (
            <ol className="mt-2 flex flex-col gap-3">
              {topTalks.map((t, i) => (
                <li key={t.id} className="flex gap-3">
                  <span className="text-2xl font-semibold leading-none text-accent">{i + 1}</span>
                  <div className="min-w-0">
                    <Link href={`/session/${encodeURIComponent(t.id)}`} className="font-medium leading-snug hover:text-accent hover:underline">
                      {t.title}
                    </Link>
                    <p className="text-sm text-muted">
                      <span className="text-accent" aria-label={`Rated ${t.score} of 5`}>
                        {"★".repeat(t.score)}
                      </span>
                      {t.reason && <> · {t.reason}</>}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">To do back at work</h3>
          {actions.length === 0 ? (
            <p className="mt-2 text-sm text-muted">Start a note with “TODO”, “Try”, “Ask” or “Follow up” and it lands here.</p>
          ) : (
            <ul className="mt-2 flex flex-col gap-2 text-sm">
              {actions.map((a, i) => (
                <li key={`${a.session_id}-${i}`} className="flex gap-2">
                  <span aria-hidden className="mt-0.5 text-muted">☐</span>
                  <span className="min-w-0">
                    {a.text}
                    <span className="block truncate text-xs text-muted">{a.title}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">Follow up with</h3>
          {followUps.length === 0 ? (
            <p className="mt-2 text-sm text-muted">People you add on a session page show up here.</p>
          ) : (
            <ul className="mt-2 flex flex-col gap-3 text-sm">
              {followUps.map((p, i) => (
                <li key={`${p.name}-${i}`}>
                  {p.profile_url ? (
                    <a href={p.profile_url} target="_blank" rel="noreferrer noopener" className="font-medium text-accent hover:underline">
                      {p.name}
                    </a>
                  ) : (
                    <span className="font-medium">{p.name}</span>
                  )}
                  {p.role && <span className="text-muted"> · {p.role}</span>}
                  {p.follow_up && <span className="block">{p.follow_up}</span>}
                  <span className="block truncate text-xs text-muted">Met at {p.session_title}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
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
