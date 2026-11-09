"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { MemoryInput } from "@/lib/capture/memory-schema";

interface Stored {
  memory: MemoryInput;
  synced: boolean;
  error?: string;
}

const RETRY_EVERY_MS = 8000;

function load(key: string): Stored[] {
  try {
    const v = JSON.parse(localStorage.getItem(key) ?? "[]") as Stored[];
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

/**
 * Local-first store for small memories (ratings, contacts): saved to localStorage at once, synced to ES with retries.
 * Saving an item with an existing id replaces it, which is how a rating gets updated.
 */
export function useSyncedMemories(storageKey: string) {
  const [items, setItems] = useState<Stored[]>(() => load(storageKey));
  const ref = useRef(items);

  const commit = useCallback(
    (next: Stored[]) => {
      ref.current = next;
      try {
        localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {}
      setItems(next);
    },
    [storageKey],
  );

  const sync = useCallback(async () => {
    const pending = ref.current.filter((i) => !i.synced);
    if (!pending.length) return;
    try {
      const res = await fetch("/api/memories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memories: pending.map((p) => p.memory) }),
      });
      const body = (await res.json().catch(() => ({}))) as { saved?: string[]; error?: string };
      if (res.status === 400) {
        // Invalid input never succeeds on retry; surface it instead of looping.
        commit(ref.current.map((i) => (i.synced ? i : { ...i, error: body.error ?? "Invalid" })));
        return;
      }
      if (!res.ok && res.status !== 207) throw new Error(body.error ?? "Sync failed");
      const saved = new Set(body.saved ?? []);
      commit(ref.current.map((i) => (saved.has(i.memory.id) ? { memory: i.memory, synced: true } : i)));
    } catch {
      // Stay pending; the interval and the online event retry.
    }
  }, [commit]);

  useEffect(() => {
    void sync();
    const onOnline = () => void sync();
    window.addEventListener("online", onOnline);
    const timer = setInterval(() => void sync(), RETRY_EVERY_MS);
    return () => {
      window.removeEventListener("online", onOnline);
      clearInterval(timer);
    };
  }, [sync]);

  const save = useCallback(
    (memory: MemoryInput) => {
      const rest = ref.current.filter((i) => i.memory.id !== memory.id);
      commit([...rest, { memory, synced: false }]);
      void sync();
    },
    [commit, sync],
  );

  return { items, save, pending: items.filter((i) => !i.synced).length };
}
