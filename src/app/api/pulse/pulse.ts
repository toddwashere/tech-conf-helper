import type { Client, estypes } from "@elastic/elasticsearch";
import { INDEX } from "@/lib/es/indices";
import type { PulseBucket, PulseResponse } from "@/lib/types";

const TZ = "America/Denver";
const SIGNALS = "room-signals";

type Buckets = { buckets: { key: string | number; key_as_string?: string; doc_count: number }[] };
type SigBuckets = { buckets: { key: string; score: number; doc_count: number; bg_count: number }[] };

function hourLabel(keyAsString: string | undefined, key: number): string {
  const d = new Date(key);
  const day = d.toLocaleDateString("en-US", { timeZone: TZ, weekday: "short" });
  const hour = d.toLocaleTimeString("en-US", { timeZone: TZ, hour: "numeric" });
  return keyAsString ? `${day} ${hour}` : String(key);
}

/** Session ids the attendee engaged with: anything they captured a memory for, plus their plan choices. */
async function mySessionIds(es: Client): Promise<string[]> {
  const [mem, plans] = await Promise.all([
    es.search({ index: INDEX.memories, size: 0, aggs: { s: { terms: { field: "session_id", size: 500 } } } }),
    es.search({ index: INDEX.plans, size: 0, aggs: { s: { terms: { field: "session_id", size: 500 } } } }),
  ]);
  const keys = (r: estypes.SearchResponse) => ((r.aggregations?.s as Buckets | undefined)?.buckets ?? []).map((b) => String(b.key));
  return [...new Set([...keys(mem), ...keys(plans)])];
}

export async function getPulse(es: Client): Promise<PulseResponse> {
  const notes: string[] = [];
  const talk = { term: { kind: "talk" } };
  const mine = await mySessionIds(es);

  const [schedule, signals, fingerprint, memories] = await Promise.all([
    es.search({
      index: INDEX.sessions,
      size: 0,
      query: talk,
      aggs: {
        tracks: { terms: { field: "tracks", size: 12 } },
        hours: {
          date_histogram: { field: "starts_at", calendar_interval: "hour", time_zone: TZ, min_doc_count: 1 },
          aggs: { top: { bucket_sort: { sort: [{ _count: "desc" }], size: 8 } } },
        },
      },
    }),
    es
      .search({
        index: SIGNALS,
        size: 0,
        ignore_unavailable: true,
        aggs: {
          t: {
            date_histogram: { field: "@timestamp", fixed_interval: "15m", time_zone: TZ, min_doc_count: 1 },
            aggs: { s: { terms: { field: "signal", size: 5 } } },
          },
        },
      })
      .catch(() => null),
    mine.length
      ? es.search({
          index: INDEX.sessions,
          size: 0,
          query: { bool: { filter: [talk, { terms: { id: mine } }] } },
          aggs: {
            tracks: { significant_terms: { field: "tracks", size: 6, min_doc_count: 1, background_filter: talk } },
            words: {
              significant_text: {
                field: "description",
                size: 10,
                min_doc_count: 2,
                filter_duplicate_text: true,
                background_filter: talk,
              },
            },
          },
        })
      : null,
    es.count({ index: INDEX.memories }),
  ]);

  const agg = <T>(r: estypes.SearchResponse | null, name: string) => r?.aggregations?.[name] as T | undefined;
  const toBuckets = (b?: Buckets): PulseBucket[] => (b?.buckets ?? []).map((x) => ({ key: String(x.key), count: x.doc_count }));

  const hours = agg<Buckets>(schedule, "hours")?.buckets ?? [];
  const signalBuckets = agg<{ buckets: (Buckets["buckets"][number] & { s: Buckets })[] }>(signals, "t")?.buckets ?? [];
  if (!signals) notes.push("No room-signals data stream yet.");
  if (!mine.length) notes.push("Capture a note or save a plan to see your conference fingerprint.");

  const sig = [
    ...(agg<SigBuckets>(fingerprint, "tracks")?.buckets ?? []).map((b) => ({ ...b, kind: "track" as const })),
    ...(agg<SigBuckets>(fingerprint, "words")?.buckets ?? []).map((b) => ({ ...b, kind: "word" as const })),
  ];

  return {
    totalSessions: typeof schedule.hits.total === "number" ? schedule.hits.total : (schedule.hits.total?.value ?? 0),
    tracks: toBuckets(agg<Buckets>(schedule, "tracks")),
    busiestHours: hours.map((h) => ({ key: hourLabel(h.key_as_string, Number(h.key)), count: h.doc_count })),
    signals: signalBuckets.map((b) => {
      const by = Object.fromEntries(b.s.buckets.map((s) => [s.key, s.doc_count]));
      return {
        key: new Date(Number(b.key)).toISOString(),
        full: by.full ?? 0,
        crowded: by.crowded ?? 0,
        other: b.doc_count - (by.full ?? 0) - (by.crowded ?? 0),
      };
    }),
    fingerprint: sig
      .sort((a, b) => b.score - a.score)
      .map((b) => ({ term: b.key, kind: b.kind, score: Number(b.score.toFixed(3)), mine: b.doc_count, everyone: b.bg_count })),
    memoriesCount: memories.count,
    mySessions: mine.length,
    notes,
  };
}
