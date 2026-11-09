import type { MemoryDoc, TripReport, TripReportDay, TripReportGlance, TripReportSession } from "@/lib/types";
import { extractActionItems } from "./action-items";

export interface SessionInfo {
  id: string;
  title: string;
  starts_at: string;
  room: string | null;
  day: string;
}

function withoutSortKey<T extends { sortKey: string }>(s: T): Omit<T, "sortKey"> {
  const { sortKey, ...rest } = s;
  void sortKey;
  return rest;
}

const UNATTACHED = "__unattached__";

/** YYYY-MM-DD of an instant in the conference time zone. */
export function dayInZone(iso: string, timeZone = "America/Denver"): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
}

/**
 * Plain-code trip report: every summary, note, rating and contact grouped under its session, sessions grouped by
 * conference day (Mountain time), days and sessions in time order. This is also the non-AI view.
 */
export function groupTripReport(
  memories: MemoryDoc[],
  sessions: Map<string, SessionInfo>,
): Pick<TripReport, "days" | "counts" | "glance"> {
  const bySession = new Map<string, TripReportSession & { day: string; sortKey: string }>();
  const counts = { sessions: 0, notes: 0, ratings: 0, contacts: 0, summaries: 0 };

  for (const m of memories) {
    const info = m.session_id ? sessions.get(m.session_id) : undefined;
    const key = info ? info.id : m.session_id ? m.session_id : `${UNATTACHED}:${dayInZone(m.created_at)}`;
    let entry = bySession.get(key);
    if (!entry) {
      entry = {
        id: info?.id ?? key,
        title: info?.title ?? (m.session_id ? "Unknown session" : "Not tied to a session"),
        starts_at: info?.starts_at ?? null,
        room: info?.room ?? null,
        actions: [],
        summary: null,
        notes: [],
        rating: null,
        contacts: [],
        day: info?.day ?? dayInZone(m.created_at),
        sortKey: info?.starts_at ?? `${m.created_at}~`,
      };
      bySession.set(key, entry);
    }
    const md = m.metadata ?? {};
    if (m.type === "summary") {
      entry.summary = m.text;
      entry.actions.push(...parseJsonList(md.action_items));
      counts.summaries++;
    } else if (m.type === "note") {
      entry.notes.push(m.text);
      counts.notes++;
    } else if (m.type === "rating") {
      const score = Number(md.score);
      if (Number.isInteger(score) && score >= 1 && score <= 5) {
        entry.rating = { score, reason: md.reason ?? null };
        counts.ratings++;
      }
    } else if (m.type === "contact" && md.name) {
      entry.contacts.push({
        name: md.name,
        role: md.role ?? null,
        profile_url: md.profile_url ?? null,
        topic: md.topic ?? null,
        follow_up: md.follow_up ?? null,
      });
      counts.contacts++;
    }
  }

  for (const entry of bySession.values()) {
    entry.actions = dedupe([...extractActionItems(entry.notes), ...entry.actions]);
  }

  const days = new Map<string, (TripReportSession & { sortKey: string })[]>();
  for (const { day, ...rest } of bySession.values()) {
    if (!days.has(day)) days.set(day, []);
    days.get(day)!.push(rest);
  }
  const result: TripReportDay[] = [...days.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, list]) => ({
      day,
      sessions: list.sort((a, b) => a.sortKey.localeCompare(b.sortKey)).map(withoutSortKey),
    }));
  counts.sessions = bySession.size;
  return { days: result, counts, glance: buildGlance(result) };
}

function parseJsonList(raw: string | undefined): string[] {
  try {
    const v: unknown = JSON.parse(raw ?? "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function dedupe(items: string[]): string[] {
  const seen = new Set<string>();
  return items.filter((i) => {
    const k = i.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

const MAX_TOP_TALKS = 3;

/** The slide-ready part of the report: best talks, everything to do, everyone to follow up with. */
export function buildGlance(days: TripReportDay[]): TripReportGlance {
  const all = days.flatMap((d) => d.sessions);
  const topTalks = all
    .filter((s) => s.rating && s.rating.score >= 3)
    .sort((a, b) => b.rating!.score - a.rating!.score || (a.starts_at ?? "").localeCompare(b.starts_at ?? ""))
    .slice(0, MAX_TOP_TALKS)
    .map((s) => ({ id: s.id, title: s.title, score: s.rating!.score, reason: s.rating!.reason, starts_at: s.starts_at }));
  const actions = all.flatMap((s) => s.actions.map((text) => ({ text, session_id: s.id, title: s.title })));
  const followUps = all.flatMap((s) =>
    s.contacts.map((c) => ({ name: c.name, role: c.role, follow_up: c.follow_up, profile_url: c.profile_url, session_title: s.title })),
  );
  return { topTalks, actions, followUps };
}
