"use client";

import { useState } from "react";
import { DEFAULT_CONFERENCE } from "@/lib/conference";
import { useSyncedMemories } from "./use-synced-memories";
import { VoiceInput } from "./voice-input";

const LABELS = ["", "Skip it", "Meh", "Okay", "Good", "Must see"];

export function RatingPanel({ sessionId, sessionTitle }: { sessionId: string; sessionTitle: string | null }) {
  const { items, save, pending } = useSyncedMemories(`cm:rating:${sessionId}`);
  const current = items[0];
  const [score, setScore] = useState<number>(() => Number(current?.memory.metadata?.score ?? 0));
  const [reason, setReason] = useState<string>(() => current?.memory.metadata?.reason ?? "");

  function submit(nextScore = score) {
    if (!nextScore) return;
    const why = reason.trim();
    save({
      id: `${DEFAULT_CONFERENCE.id}:rating:${sessionId}`.replace(/[^\w:.-]/g, "_"),
      type: "rating",
      session_id: sessionId,
      source: "rating-panel",
      title: sessionTitle ? `Rating: ${sessionTitle}` : "Rating",
      text: `Rated ${nextScore}/5 (${LABELS[nextScore]})${why ? `: ${why}` : ""}`,
      metadata: { score: String(nextScore), ...(why ? { reason: why } : {}) },
      created_at: new Date().toISOString(),
    });
  }

  const status = !current ? null : current.error ? "error" : current.synced ? "synced" : "pending";

  return (
    <section aria-labelledby="rating-heading" className="rounded-xl border border-border bg-surface p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 id="rating-heading" className="text-sm font-semibold uppercase tracking-wider text-muted">
          Worth it?
        </h2>
        {status && (
          <span
            role="status"
            className={`rounded-full border px-2 py-0.5 text-xs ${
              status === "synced" ? "border-emerald-500/50 text-emerald-400" : "border-warn/50 text-warn"
            }`}
          >
            {status === "synced" ? "Saved" : pending ? "Pending sync" : "Not saved"}
          </span>
        )}
      </div>
      <div className="mt-3 flex gap-1" role="radiogroup" aria-label="Rating from 1 to 5">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={score === n}
            aria-label={`${n} of 5, ${LABELS[n]}`}
            title={LABELS[n]}
            onClick={() => {
              setScore(n);
              submit(n);
            }}
            className={`h-11 flex-1 rounded-lg border text-lg font-semibold ${
              n <= score ? "border-accent bg-accent/15 text-accent" : "border-border text-muted hover:border-accent"
            }`}
          >
            {n}
          </button>
        ))}
      </div>
      {score > 0 && <p className="mt-1 text-xs text-muted">{LABELS[score]}</p>}
      <form
        className="mt-3 flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <input
          aria-label="One-line reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={300}
          placeholder="Why? (optional, one line)"
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
        />
        <VoiceInput label="Say it" onText={(t) => setReason(t)} />
        <button
          type="submit"
          disabled={!score}
          className="ml-auto rounded-lg bg-accent-strong px-3 py-2 text-sm font-medium text-background hover:bg-accent disabled:opacity-40"
        >
          Save
        </button>
      </form>
      {current?.error && <p className="mt-2 text-xs text-danger">{current.error}</p>}
    </section>
  );
}
