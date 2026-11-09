"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { formatDayInZone, formatTimeInZone } from "@/lib/time";
import type { SessionDoc } from "@/lib/types";
import { CaptionPanel } from "./caption-panel";
import { ContactsPanel } from "./contacts-panel";
import { NotesPanel } from "./notes-panel";
import { RatingPanel } from "./rating-panel";
import { RelatedPanel } from "./related-panel";
import { SummaryPanel } from "./summary-panel";
import { useNotes } from "./use-notes";
import { useTranscriptSync } from "./use-transcript-sync";

const TZ = "America/Denver";

type Load =
  | { kind: "loading" }
  | { kind: "ready"; session: SessionDoc }
  | { kind: "missing" }
  | { kind: "error"; message: string };

export function SessionCapture({ sessionId }: { sessionId: string }) {
  const [load, setLoad] = useState<Load>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);
  const transcript = useTranscriptSync(sessionId);
  const notes = useNotes(sessionId);
  const { flush } = transcript;
  const { sync } = notes;

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/sessions/${encodeURIComponent(sessionId)}`, { signal: controller.signal })
      .then(async (r) => {
        const body = (await r.json()) as { session?: SessionDoc; error?: string };
        if (r.status === 404) return setLoad({ kind: "missing" });
        if (!r.ok || !body.session) throw new Error(body.error ?? "Session unavailable");
        setLoad({ kind: "ready", session: body.session });
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setLoad({ kind: "error", message: err instanceof Error ? err.message : "Session unavailable" });
      });
    return () => controller.abort();
  }, [sessionId, attempt]);

  const beforeSummarize = useCallback(async () => {
    await Promise.all([flush(), sync()]);
  }, [flush, sync]);

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:py-10">
      <Link href="/" className="text-sm text-accent hover:underline">
        ← All sessions
      </Link>

      {load.kind === "loading" && (
        <div className="mt-4 flex flex-col gap-2" aria-label="Loading session">
          <div className="h-4 w-48 animate-pulse rounded bg-surface-2" />
          <div className="h-8 w-full max-w-2xl animate-pulse rounded bg-surface-2" />
          <div className="h-4 w-64 animate-pulse rounded bg-surface-2" />
        </div>
      )}
      {load.kind === "error" && (
        <div className="mt-6 rounded-lg border border-danger/40 bg-danger/10 p-4 text-danger">
          <p>{load.message} Captions and notes below still work and will sync later.</p>
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
      )}
      {load.kind === "missing" && (
        <div className="mt-6 rounded-xl border border-border bg-surface p-6">
          <h1 className="text-xl font-semibold">We couldn&apos;t find that session</h1>
          <p className="mt-1 text-muted">It may have been removed from the schedule, or the link is incomplete.</p>
          <Link href="/" className="mt-3 inline-block rounded-lg bg-accent-strong px-4 py-2 text-sm font-medium text-background hover:bg-accent">
            Search sessions
          </Link>
        </div>
      )}
      {load.kind === "ready" && <SessionHeader session={load.session} />}
      {load.kind !== "missing" && (
        <>
          <div className="mt-6 grid grid-cols-1 gap-6 [&>*]:min-w-0 lg:grid-cols-[minmax(0,1fr)_340px]">
            <CaptionPanel sync={transcript} />
            <NotesPanel state={notes} />
          </div>

          <div className="mt-6 grid grid-cols-1 gap-6 [&>*]:min-w-0 lg:grid-cols-[340px_minmax(0,1fr)]">
            <RatingPanel sessionId={sessionId} sessionTitle={load.kind === "ready" ? load.session.title : null} />
            <ContactsPanel sessionId={sessionId} />
          </div>

          <div className="mt-6 grid grid-cols-1 gap-6 [&>*]:min-w-0 lg:grid-cols-2">
            <SummaryPanel sessionId={sessionId} beforeSummarize={beforeSummarize} />
            <RelatedPanel sessionId={sessionId} refreshKey={notes.notes.length} />
          </div>
        </>
      )}
    </main>
  );
}

function SessionHeader({ session }: { session: SessionDoc }) {
  const place = [session.building, session.room, session.room_level].filter(Boolean).join(" · ");
  return (
    <header className="mt-4">
      <p className="text-sm font-medium text-accent">
        {formatDayInZone(session.starts_at, TZ)} · {formatTimeInZone(session.starts_at, TZ)}–{formatTimeInZone(session.ends_at, TZ)}{" "}
        <span className="text-muted">Mountain time</span>
      </p>
      <h1 className="mt-1 text-2xl font-semibold leading-tight sm:text-3xl">{session.title}</h1>
      <p className="mt-1 text-muted">
        {place || "Room TBA"}
        {session.full && <span className="ml-2 rounded bg-warn/15 px-2 py-0.5 text-sm text-warn">Full</span>}
      </p>
      {session.speakers.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm">
          {session.speakers.map((s) => (
            <li key={s.id}>
              <span className="font-medium">{s.name}</span>
              {s.tagline && <span className="text-muted"> · {s.tagline}</span>}
            </li>
          ))}
        </ul>
      )}
      {session.description && (
        <details className="mt-3 text-sm text-foreground/80">
          <summary className="cursor-pointer text-muted">Abstract</summary>
          <p className="mt-2 whitespace-pre-line leading-relaxed">{session.description}</p>
        </details>
      )}
      {(session.tracks.length > 0 || session.links.length > 0) && (
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          {session.tracks.map((t) => (
            <span key={t} className="rounded-full bg-surface-2 px-2 py-1 text-muted">
              {t}
            </span>
          ))}
          {session.links.map((l) => (
            <a
              key={l.url}
              href={l.url}
              target="_blank"
              rel="noreferrer"
              className="rounded-full border border-border px-2 py-1 text-accent hover:border-accent"
            >
              {l.label} ↗
            </a>
          ))}
        </div>
      )}
    </header>
  );
}
