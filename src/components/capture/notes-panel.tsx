"use client";

import { useState } from "react";
import { formatTimeInZone } from "@/lib/time";
import type { useNotes } from "./use-notes";
import { VoiceInput } from "./voice-input";

type NotesState = ReturnType<typeof useNotes>;

export function NotesPanel({ state }: { state: NotesState }) {
  const [draft, setDraft] = useState("");
  const { notes, addNote, pending, online, syncing, error, sync } = state;

  function submit() {
    addNote(draft);
    setDraft("");
  }

  return (
    <section aria-labelledby="notes-heading" className="flex flex-col rounded-xl border border-border bg-black/60 p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 id="notes-heading" className="text-sm font-semibold uppercase tracking-wider text-muted">
          Notes
        </h2>
        <SyncBadge pending={pending} online={online} syncing={syncing} total={notes.length} />
      </div>

      <form
        className="mt-3"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <textarea
          aria-label="New note"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              submit();
            }
          }}
          rows={4}
          placeholder="Write what matters. Saved on this device instantly."
          className="w-full resize-y rounded-lg border border-border bg-background p-3 text-base leading-relaxed outline-none placeholder:text-muted/70 focus:border-accent"
        />
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <VoiceInput label="Dictate" onText={(t) => setDraft((d) => (d.trim() ? `${d.trim()} ${t}` : t))} />
          <span className="hidden text-xs text-muted sm:inline">⌘/Ctrl + Enter</span>
          <button
            type="submit"
            disabled={!draft.trim()}
            className="rounded-lg bg-accent-strong px-4 py-2 text-sm font-medium text-background hover:bg-accent disabled:opacity-40"
          >
            Add note
          </button>
        </div>
      </form>

      {error && pending > 0 && (
        <p className="mt-3 rounded-lg border border-warn/40 bg-warn/10 p-2 text-xs text-warn">
          {online ? "Couldn't reach the server" : "You're offline"}. Notes are safe on this device and will sync
          automatically.{" "}
          <button type="button" className="underline" onClick={() => void sync()}>
            Retry now
          </button>
        </p>
      )}

      <ol className="mt-4 flex flex-col gap-2" aria-label="Saved notes">
        {notes.length === 0 && <li className="text-sm text-muted">No notes yet.</li>}
        {[...notes].reverse().map((n) => (
          <li key={n.id} className="rounded-lg border border-border/60 bg-background/60 p-3">
            <p className="whitespace-pre-wrap text-sm leading-relaxed">{n.text}</p>
            <p className="mt-1 flex items-center gap-2 text-xs text-muted">
              <span>{formatTimeInZone(n.createdAt)}</span>
              <span aria-label={n.synced ? "Synced" : "Pending sync"} className={n.synced ? "text-emerald-400" : "text-warn"}>
                {n.synced ? "✓ synced" : "● pending"}
              </span>
            </p>
          </li>
        ))}
      </ol>
    </section>
  );
}

function SyncBadge({ pending, online, syncing, total }: { pending: number; online: boolean; syncing: boolean; total: number }) {
  let label: string;
  let tone: string;
  if (!online && pending) {
    label = `Offline · ${pending} pending`;
    tone = "border-warn/50 text-warn";
  } else if (syncing) {
    label = "Syncing…";
    tone = "border-accent/50 text-accent";
  } else if (pending) {
    label = `${pending} pending`;
    tone = "border-warn/50 text-warn";
  } else {
    label = total ? "All synced" : "Ready";
    tone = "border-emerald-500/50 text-emerald-400";
  }
  return (
    <span role="status" aria-live="polite" className={`rounded-full border px-2 py-0.5 text-xs ${tone}`}>
      {label}
    </span>
  );
}
