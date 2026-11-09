"use client";

import Link from "next/link";
import { useState } from "react";
import { formatDayInZone, formatTimeInZone } from "@/lib/time";
import type { ImportPreview, ImportProgress, ImportResult, ImportStreamEvent } from "@/lib/types";

const CONFERENCE_TZ = "America/Denver";
const KUBECON_FEEDS = [
  "https://sessionize.com/api/v2/svi82w6c/view/All",
  "https://sessionize.com/api/v2/ayajbd6b/view/All",
  "https://sessionize.com/api/v2/etvmcsmr/view/All",
];

type Stage = "idle" | "previewing" | "previewed" | "importing" | "done" | "error";

const PHASE_LABEL: Record<ImportProgress["phase"], string> = {
  fetching: "Fetching feeds",
  embedding: "Embedding abstracts with ELSER",
  speakers: "Indexing speakers",
};

export function ScheduleImporter() {
  const [urls, setUrls] = useState("");
  const [stage, setStage] = useState<Stage>("idle");
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const urlList = urls
    .split(/\s+/)
    .map((u) => u.trim())
    .filter(Boolean);

  async function runPreview() {
    setStage("previewing");
    setError(null);
    setPreview(null);
    setResult(null);
    try {
      const res = await fetch("/api/import/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ urls: urlList }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Preview failed");
      setPreview(body as ImportPreview);
      setStage("previewed");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Preview failed");
      setStage("error");
    }
  }

  async function runImport() {
    setStage("importing");
    setError(null);
    setProgress({ phase: "fetching", done: 0, total: urlList.length });
    try {
      const res = await fetch("/api/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ urls: urlList }),
      });
      if (!res.ok || !res.body) throw new Error("Import failed to start");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const event = JSON.parse(line) as ImportStreamEvent;
          if (event.type === "progress") setProgress(event);
          if (event.type === "error") throw new Error(event.error);
          if (event.type === "done") {
            setResult(event.result);
            setStage("done");
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
      setStage("error");
    }
  }

  const busy = stage === "previewing" || stage === "importing";

  return (
    <section className="flex flex-col gap-6">
      <div className="rounded-xl border border-border bg-surface p-4">
        <label htmlFor="feed-urls" className="text-sm font-medium">
          Schedule feed URLs (one per line)
        </label>
        <textarea
          id="feed-urls"
          rows={4}
          className="mt-2 w-full rounded-lg border border-border bg-background px-3 py-2 font-mono text-sm outline-none focus:border-accent"
          placeholder="https://sessionize.com/api/v2/…/view/All"
          value={urls}
          onChange={(e) => setUrls(e.target.value)}
          disabled={busy}
        />
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded-lg border border-border px-4 py-2 text-sm text-muted hover:border-accent hover:text-foreground"
            onClick={() => setUrls(KUBECON_FEEDS.join("\n"))}
            disabled={busy}
          >
            Use KubeCon NA 2026
          </button>
          <button
            type="button"
            className="rounded-lg bg-accent-strong px-4 py-2 text-sm font-medium text-background hover:bg-accent disabled:opacity-50"
            onClick={runPreview}
            disabled={busy || urlList.length === 0}
          >
            {stage === "previewing" ? "Reading feeds…" : "Preview"}
          </button>
        </div>
      </div>

      {error && <p className="rounded-lg border border-danger/40 bg-danger/10 p-4 text-danger">{error}</p>}

      {preview && <PreviewCard preview={preview} />}

      {preview && stage !== "done" && (
        <button
          type="button"
          className="self-start rounded-lg bg-accent-strong px-5 py-3 font-medium text-background hover:bg-accent disabled:opacity-50"
          onClick={runImport}
          disabled={busy}
        >
          {preview.changedSessions === 0
            ? "Re-sync (everything is already up to date)"
            : `Import ${preview.changedSessions} new or changed ${preview.changedSessions === 1 ? "session" : "sessions"}`}
        </button>
      )}

      {stage === "importing" && progress && <ProgressBar progress={progress} />}

      {stage === "done" && result && (
        <div className="rounded-xl border border-accent/40 bg-accent/10 p-4">
          <p className="font-medium">
            Imported {result.sessions} sessions and {result.speakers} speakers in {(result.tookMs / 1000).toFixed(1)}s.
          </p>
          <p className="mt-1 text-sm text-muted">
            {result.changedSessions === 1 ? "1 session was" : `${result.changedSessions} sessions were`} new or changed
            and got fresh embeddings; the rest were unchanged and skipped.{" "}
            {result.errors > 0 ? `${result.errors} documents failed.` : "No errors."}
          </p>
          <Link href="/" className="mt-3 inline-block text-accent underline">
            Search the schedule →
          </Link>
        </div>
      )}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg bg-surface-2 p-3">
      <div className="text-2xl font-semibold">{value}</div>
      <div className="text-xs text-muted">{label}</div>
    </div>
  );
}

function PreviewCard({ preview }: { preview: ImportPreview }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <h2 className="text-lg font-semibold">What we found</h2>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="talks" value={preview.talks} />
        <Stat label="speakers" value={preview.speakers} />
        <Stat label="rooms" value={preview.rooms} />
        <Stat label="new or changed" value={preview.changedSessions} />
      </div>
      <ul className="mt-4 flex flex-col gap-1 text-sm text-muted">
        <li>
          Days: {preview.days.map((d) => `${formatDayInZone(`${d.name}T12:00:00-07:00`, CONFERENCE_TZ)} (${d.count})`).join(", ")}
        </li>
        <li>Buildings: {preview.buildings.map((b) => `${b.name} (${b.count})`).join(", ")}</li>
        <li>
          {preview.logistics} logistics items kept apart from talks · {preview.skippedDuplicates} duplicates merged ·{" "}
          {preview.full} already sold out · {preview.missingDescription} talks without a description
        </li>
        {preview.timeZoneExample && (
          <li>
            Times have no offset in the feed, so we applied Mountain time: “{preview.timeZoneExample.title}” →{" "}
            <code className="text-foreground">{preview.timeZoneExample.local}</code>
          </li>
        )}
      </ul>
      <div className="mt-4 flex flex-wrap gap-2 text-xs">
        {preview.tracks.map((t) => (
          <span key={t.name} className="rounded-full bg-surface-2 px-2 py-1 text-muted">
            {t.name} · {t.count}
          </span>
        ))}
      </div>
      <h3 className="mt-5 text-sm font-medium">Sample</h3>
      <ul className="mt-2 flex flex-col gap-2 text-sm">
        {preview.sample.map((s) => (
          <li key={s.title} className="rounded-lg bg-surface-2 p-3">
            <div className="text-accent">
              {formatDayInZone(s.starts_at, CONFERENCE_TZ)} · {formatTimeInZone(s.starts_at, CONFERENCE_TZ)} · {s.room}
            </div>
            <div className="font-medium">{s.title}</div>
            {s.speakers.length > 0 && <div className="text-muted">{s.speakers.join(", ")}</div>}
          </li>
        ))}
      </ul>
    </div>
  );
}

function ProgressBar({ progress }: { progress: ImportProgress }) {
  const pct = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;
  return (
    <div aria-live="polite">
      <div className="flex justify-between text-sm text-muted">
        <span>{PHASE_LABEL[progress.phase]}</span>
        <span>
          {progress.done}/{progress.total}
        </span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-2">
        <div className="h-full bg-accent-strong transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
