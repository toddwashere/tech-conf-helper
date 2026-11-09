"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { DEFAULT_CONFERENCE } from "@/lib/conference";
import { loadNotes, newNoteId, saveNotes, type LocalNote } from "@/lib/capture/notes-store";

const RETRY_EVERY_MS = 8000;

export function useNotes(sessionId: string) {
  // Rendered client-only (see capture-client.tsx), so localStorage is available on first render.
  const [notes, setNotes] = useState<LocalNote[]>(() => loadNotes(sessionId));
  const [online, setOnline] = useState(() => navigator.onLine);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const notesRef = useRef<LocalNote[]>(notes);

  const commit = useCallback(
    (next: LocalNote[]) => {
      notesRef.current = next;
      saveNotes(sessionId, next);
      setNotes(next);
    },
    [sessionId],
  );

  const sync = useCallback(async () => {
    const pending = notesRef.current.filter((n) => !n.synced);
    if (!pending.length) return;
    setSyncing(true);
    try {
      const res = await fetch("/api/memories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          memories: pending.map((n) => ({
            id: n.id,
            type: "note",
            session_id: n.sessionId,
            source: "notes-panel",
            text: n.text,
            created_at: n.createdAt,
          })),
        }),
      });
      const body = (await res.json().catch(() => ({}))) as { saved?: string[]; error?: string };
      if (!res.ok && res.status !== 207) throw new Error(body.error ?? `Sync failed (${res.status})`);
      const saved = new Set(body.saved ?? []);
      commit(notesRef.current.map((n) => (saved.has(n.id) ? { ...n, synced: true } : n)));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  }, [commit]);

  useEffect(() => {
    void sync();
    const onOnline = () => {
      setOnline(true);
      void sync();
    };
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    const timer = setInterval(() => void sync(), RETRY_EVERY_MS);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      clearInterval(timer);
    };
  }, [sessionId, sync]);

  const addNote = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      const note: LocalNote = {
        id: newNoteId(DEFAULT_CONFERENCE.id),
        sessionId,
        text: trimmed,
        createdAt: new Date().toISOString(),
        synced: false,
      };
      commit([...notesRef.current, note]);
      void sync();
    },
    [commit, sessionId, sync],
  );

  const pending = notes.filter((n) => !n.synced).length;
  return { notes, addNote, sync, pending, online, syncing, error };
}
