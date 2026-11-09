"use client";

import type { EmbeddingsProfile } from "@/lib/types";

export interface SearchEngine {
  embeddings: EmbeddingsProfile;
  rerank: boolean;
}

export const DEFAULT_ENGINE: SearchEngine = { embeddings: "elser", rerank: false };

export function SearchEngineToggle({
  value,
  onChange,
  tookMs,
}: {
  value: SearchEngine;
  onChange: (next: SearchEngine) => void;
  tookMs?: number | null;
}) {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted">
      <label className="flex items-center gap-1">
        Embeddings
        <select
          aria-label="Embeddings model"
          className="rounded border border-border bg-surface px-2 py-1"
          value={value.embeddings}
          onChange={(e) => onChange({ ...value, embeddings: e.target.value as EmbeddingsProfile })}
        >
          <option value="elser">ELSER (local)</option>
          <option value="jina">Jina v5 (EIS, multilingual)</option>
        </select>
      </label>
      <label className="flex items-center gap-1">
        <input
          type="checkbox"
          checked={value.rerank}
          onChange={(e) => onChange({ ...value, rerank: e.target.checked })}
        />
        Rerank top 10
      </label>
      {typeof tookMs === "number" && <span>{tookMs} ms in Elasticsearch</span>}
    </div>
  );
}
