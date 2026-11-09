"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { MemoryInput } from "@/lib/capture/memory-schema";
import { TranscriptBuffer } from "@/lib/capture/replay";

const FLUSH_EVERY_MS = 5000;

export interface TranscriptSyncStatus {
  savedChunks: number;
  queuedChunks: number;
  error: string | null;
}

/** Buffers final captions and bulk-saves them as `transcript` memories every few seconds, retrying on failure. */
export function useTranscriptSync(sessionId: string) {
  const buffer = useRef(new TranscriptBuffer());
  const queue = useRef<MemoryInput[]>([]);
  const capture = useRef({ id: "", source: "web-speech", seq: 0 });
  const inFlight = useRef<Promise<void> | null>(null);
  const [status, setStatus] = useState<TranscriptSyncStatus>({ savedChunks: 0, queuedChunks: 0, error: null });

  const beginCapture = useCallback((source: "web-speech" | "replay") => {
    capture.current = { id: Date.now().toString(36), source, seq: 0 };
  }, []);

  const push = useCallback((text: string, offsetMs: number) => {
    buffer.current.add({ text, offsetMs });
  }, []);

  const flush = useCallback(async () => {
    if (inFlight.current) await inFlight.current;
    const chunk = buffer.current.drain();
    if (chunk) {
      const c = capture.current;
      const seq = c.seq++;
      queue.current.push({
        id: `${sessionId}:transcript:${c.id}:${String(seq).padStart(4, "0")}`.replace(/[^\w:.-]/g, "_"),
        type: "transcript",
        session_id: sessionId,
        source: c.source,
        text: chunk.text,
        lang: "en",
        starts_at_ms: chunk.startsAtMs,
        metadata: { capture_id: c.id, seq: String(seq), ends_at_ms: String(chunk.endsAtMs), sentences: String(chunk.sentences) },
        created_at: new Date().toISOString(),
      });
    }
    if (!queue.current.length) return;
    const batch = queue.current.slice(0, 50);
    inFlight.current = (async () => {
      try {
        const res = await fetch("/api/memories", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ memories: batch }),
        });
        const body = (await res.json().catch(() => ({}))) as { saved?: string[]; error?: string };
        if (!res.ok && res.status !== 207) throw new Error(body.error ?? `Save failed (${res.status})`);
        const saved = new Set(body.saved ?? []);
        queue.current = queue.current.filter((m) => !saved.has(m.id));
        setStatus((s) => ({ savedChunks: s.savedChunks + saved.size, queuedChunks: queue.current.length, error: null }));
      } catch (err) {
        const message = err instanceof Error ? err.message : "Save failed";
        setStatus((s) => ({ ...s, queuedChunks: queue.current.length, error: `${message}. Will retry.` }));
      } finally {
        inFlight.current = null;
      }
    })();
    await inFlight.current;
  }, [sessionId]);

  useEffect(() => {
    const timer = setInterval(() => void flush(), FLUSH_EVERY_MS);
    const onOnline = () => void flush();
    window.addEventListener("online", onOnline);
    return () => {
      clearInterval(timer);
      window.removeEventListener("online", onOnline);
    };
  }, [flush]);

  return { beginCapture, push, flush, status };
}
