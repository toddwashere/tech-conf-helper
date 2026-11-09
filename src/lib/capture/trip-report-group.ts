import type { MemoryDoc, TripReport, TripReportDay, TripReportSession } from "@/lib/types";

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
export function groupTripReport(memories: MemoryDoc[], sessions: Map<string, SessionInfo>): Pick<TripReport, "days" | "counts"> {
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
  return { days: result, counts };
}
