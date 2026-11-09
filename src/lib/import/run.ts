import { createHash } from "node:crypto";
import type { Client } from "@elastic/elasticsearch";
import { ensureIndices, INDEX } from "../es/indices";
import type { ImportPreview, ImportProgress, ImportResult, SessionDoc, SpeakerDoc } from "../types";
import { mapSessionize } from "./sessionize";

export interface ImportSource {
  url: string;
}

export interface ImportOptions {
  conference: string;
  timeZone?: string;
}

interface LoadedSchedule {
  sessions: SessionDoc[];
  speakers: SpeakerDoc[];
  skippedDuplicates: number;
}

interface ImportPlan extends LoadedSchedule {
  changed: (SessionDoc & { doc_hash: string })[];
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

async function existingHashes(es: Client, conference: string): Promise<Map<string, string>> {
  const hashes = new Map<string, string>();
  if (!(await es.indices.exists({ index: INDEX.sessions }))) return hashes;
  const res = await es.search<{ doc_hash?: string }>({
    index: INDEX.sessions,
    size: 10_000,
    query: { term: { conference } },
    _source: ["doc_hash"],
  });
  for (const hit of res.hits.hits) if (hit._id && hit._source?.doc_hash) hashes.set(hit._id, hit._source.doc_hash);
  return hashes;
}

export async function loadSessionize(sources: ImportSource[], options: ImportOptions): Promise<LoadedSchedule> {
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
  return { sessions: [...sessions.values()], speakers: [...speakers.values()], skippedDuplicates };
}

async function planImport(es: Client, sources: ImportSource[], options: ImportOptions): Promise<ImportPlan> {
  const loaded = await loadSessionize(sources, options);
  const previous = await existingHashes(es, options.conference);
  const changed = loaded.sessions
    .map((s) => ({ ...s, doc_hash: docHash(s) }))
    .filter((s) => previous.get(s.id) !== s.doc_hash);
  return { ...loaded, changed };
}

function countBy(values: string[]): { name: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
}

export function summarizeSchedule(loaded: LoadedSchedule, changedCount: number): Omit<ImportPreview, "conference" | "sources"> {
  const talks = loaded.sessions.filter((s) => s.kind === "talk");
  const realTalks = talks.filter((s) => s.speakers.length > 0 && s.description && !s.full);
  const step = Math.max(1, Math.floor(realTalks.length / 3));
  const sampleTalks = [realTalks[0], realTalks[step], realTalks[step * 2]].filter((s) => s !== undefined);
  return {
    sessions: loaded.sessions.length,
    talks: talks.length,
    logistics: loaded.sessions.length - talks.length,
    speakers: loaded.speakers.length,
    changedSessions: changedCount,
    skippedDuplicates: loaded.skippedDuplicates,
    days: countBy(loaded.sessions.map((s) => s.day)).sort((a, b) => a.name.localeCompare(b.name)),
    tracks: countBy(talks.flatMap((s) => s.tracks)).slice(0, 12),
    buildings: countBy(loaded.sessions.map((s) => s.building ?? "Other")),
    rooms: new Set(loaded.sessions.map((s) => s.room)).size,
    full: loaded.sessions.filter((s) => s.full).length,
    missingDescription: talks.filter((s) => !s.description).length,
    timeZoneExample: sampleTalks[0] ? { local: sampleTalks[0].starts_at, title: sampleTalks[0].title } : null,
    sample: sampleTalks.slice(0, 3).map((s) => ({ title: s.title, starts_at: s.starts_at, room: s.room, speakers: s.speaker_names })),
  };
}

export async function previewSessionize(es: Client, sources: ImportSource[], options: ImportOptions): Promise<ImportPreview> {
  const plan = await planImport(es, sources, options);
  return { conference: options.conference, sources: sources.map((s) => s.url), ...summarizeSchedule(plan, plan.changed.length) };
}

async function bulkIndex(
  es: Client,
  index: string,
  docs: { id: string }[],
  onBatch?: (done: number, total: number) => void,
): Promise<number> {
  let errors = 0;
  const chunkSize = 25;
  for (let i = 0; i < docs.length; i += chunkSize) {
    const chunk = docs.slice(i, i + chunkSize);
    const res = await es.bulk(
      { operations: chunk.flatMap((doc) => [{ index: { _index: index, _id: doc.id } }, doc]) },
      { requestTimeout: 600_000 },
    );
    onBatch?.(Math.min(i + chunkSize, docs.length), docs.length);
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
  onProgress?: (event: ImportProgress) => void,
): Promise<ImportResult> {
  const started = Date.now();
  await ensureIndices(es);
  onProgress?.({ phase: "fetching", done: 0, total: sources.length });

  const plan = await planImport(es, sources, options);
  onProgress?.({ phase: "embedding", done: 0, total: plan.changed.length });

  const sessionErrors = await bulkIndex(es, INDEX.sessions, plan.changed, (done, total) =>
    onProgress?.({ phase: "embedding", done, total }),
  );
  onProgress?.({ phase: "speakers", done: 0, total: plan.speakers.length });
  const speakerErrors = await bulkIndex(es, INDEX.speakers, plan.speakers);
  await es.indices.refresh({ index: [INDEX.sessions, INDEX.speakers] });

  return {
    conference: options.conference,
    sources: sources.map((s) => s.url),
    sessions: plan.sessions.length,
    changedSessions: plan.changed.length,
    speakers: plan.speakers.length,
    days: [...new Set(plan.sessions.map((s) => s.day))].sort(),
    skippedDuplicates: plan.skippedDuplicates,
    errors: sessionErrors + speakerErrors,
    tookMs: Date.now() - started,
  };
}
