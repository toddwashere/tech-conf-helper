"use client";

import { QueryInspector } from "./query-inspector";
import type { EmbeddingsProfile, SearchMeta } from "@/lib/types";

/** Unset fields mean "server default" (EMBEDDINGS env; rerank on for Jina, off for local ELSER). */
export interface SearchEngine {
  embeddings?: EmbeddingsProfile;
  rerank?: boolean;
}

export const DEFAULT_ENGINE: SearchEngine = {};

const PROFILE_LABEL: Record<EmbeddingsProfile, string> = { elser: "ELSER", jina: "Jina v5" };

export function SearchEngineToggle({
  value,
  onChange,
  meta,
}: {
  value: SearchEngine;
  onChange: (next: SearchEngine) => void;
  meta?: Partial<SearchMeta> | null;
}) {
  return (
    <div className="mt-3">
      <div className="flex flex-wrap items-center gap-3 text-xs text-muted">
        <label className="flex items-center gap-1">
          Embeddings
          <select
            aria-label="Embeddings model"
            className="rounded border border-border bg-surface px-2 py-1"
            value={value.embeddings ?? meta?.profile ?? "elser"}
            onChange={(e) => onChange({ ...value, embeddings: e.target.value as EmbeddingsProfile })}
          >
            <option value="elser">ELSER (local)</option>
            <option value="jina">Jina v5 (EIS, multilingual)</option>
          </select>
        </label>
        <label className="flex items-center gap-1">
          <input type="checkbox" checked={value.rerank ?? meta?.reranked ?? false} onChange={(e) => onChange({ ...value, rerank: e.target.checked })} />
          Rerank
        </label>
        {meta?.profile && (
          <span className="flex items-center gap-1">
            <span className="rounded bg-accent/15 px-1.5 py-0.5 font-mono text-accent">{PROFILE_LABEL[meta.profile]}</span>
            {meta.reranked && <span className="rounded bg-accent/15 px-1.5 py-0.5 font-mono text-accent">reranked</span>}
            {typeof meta.tookMs === "number" && <span>{meta.tookMs} ms</span>}
          </span>
        )}
      </div>
      <QueryInspector traces={meta?.trace} />
    </div>
  );
}
