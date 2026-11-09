import { createHash } from "node:crypto";
import type { Client } from "@elastic/elasticsearch";
import { ensureIndices, INDEX } from "../es/indices";
import type { ImportResult, SessionDoc, SpeakerDoc } from "../types";
import { mapSessionize } from "./sessionize";

export interface ImportSource {
  url: string;
}

export interface ImportOptions {
  conference: string;
  timeZone?: string;
}

const SESSIONIZE_URL = /^https:\/\/sessionize\.com\/api\/v2\/[a-z0-9]+\/view\/All\/?$/i;

export function isSessionizeUrl(url: string): boolean {
  return SESSIONIZE_URL.test(url.trim());
}

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`Fetching ${url} failed with HTTP ${res.status}`);
  return res.json();
}

export function docHash(doc: object): string {
  return createHash("sha1").update(JSON.stringify(doc)).digest("hex");
}

async function existingHashes(es: Client, index: string, conference: string): Promise<Map<string, string>> {
  const hashes = new Map<string, string>();
  const res = await es.search<{ doc_hash?: string }>({
    index,
    size: 10_000,
    query: { term: { conference } },
    _source: ["doc_hash"],
  });
  for (const hit of res.hits.hits) if (hit._id && hit._source?.doc_hash) hashes.set(hit._id, hit._source.doc_hash);
  return hashes;
}

async function bulkIndex(
  es: Client,
  index: string,
  docs: { id: string }[],
  onProgress?: (done: number, total: number) => void,
): Promise<number> {
  let errors = 0;
  const chunkSize = 25;
  for (let i = 0; i < docs.length; i += chunkSize) {
    const chunk = docs.slice(i, i + chunkSize);
    const res = await es.bulk(
      { operations: chunk.flatMap((doc) => [{ index: { _index: index, _id: doc.id } }, doc]) },
      { requestTimeout: 600_000 },
    );
    onProgress?.(Math.min(i + chunkSize, docs.length), docs.length);
    if (res.errors) {
      for (const item of res.items) {
        if (item.index?.error) {
          errors++;
          if (errors <= 3) console.error(`[import] ${index} ${item.index._id}:`, item.index.error.reason);
        }
      }
    }
  }
  return errors;
}

export async function importSessionize(
  es: Client,
  sources: ImportSource[],
  options: ImportOptions,
  onProgress?: (done: number, total: number) => void,
): Promise<ImportResult> {
  const started = Date.now();
  await ensureIndices(es);

  const sessions = new Map<string, SessionDoc>();
  const speakers = new Map<string, SpeakerDoc>();
  let skippedDuplicates = 0;

  for (const { url } of sources) {
    if (!isSessionizeUrl(url)) throw new Error(`Not a Sessionize "All" feed URL: ${url}`);
    const raw = await fetchJson(url);
    const mapped = mapSessionize(raw, { conference: options.conference, source: url, timeZone: options.timeZone });
    for (const s of mapped.sessions) {
      if (sessions.has(s.id)) skippedDuplicates++;
      else sessions.set(s.id, s);
    }
    for (const sp of mapped.speakers) {
      const existing = speakers.get(sp.id);
      if (existing) existing.session_ids = [...new Set([...existing.session_ids, ...sp.session_ids])];
      else speakers.set(sp.id, sp);
    }
  }

  const previous = await existingHashes(es, INDEX.sessions, options.conference);
  const changedSessions = [...sessions.values()]
    .map((s) => ({ ...s, doc_hash: docHash(s) }))
    .filter((s) => previous.get(s.id) !== s.doc_hash);

  const sessionErrors = await bulkIndex(es, INDEX.sessions, changedSessions, onProgress);
  const speakerErrors = await bulkIndex(es, INDEX.speakers, [...speakers.values()]);
  await es.indices.refresh({ index: [INDEX.sessions, INDEX.speakers] });

  return {
    conference: options.conference,
    sources: sources.map((s) => s.url),
    sessions: sessions.size,
    changedSessions: changedSessions.length,
    speakers: speakers.size,
    days: [...new Set([...sessions.values()].map((s) => s.day))].sort(),
    skippedDuplicates,
    errors: sessionErrors + speakerErrors,
    tookMs: Date.now() - started,
  };
}
