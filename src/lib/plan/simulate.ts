import { roomLocation } from "../geo";
import { localToZonedIso } from "../time";
import type { RoomSignalDoc, RoomSignalKind, SessionDoc } from "../types";

/**
 * Simulated `room-signals` history so dashboards have a believable timeline before the real
 * conference starts. Every doc is tagged `source: "simulated"`; the reroute logic ignores them.
 */
export const SIMULATED_SOURCE = "simulated";

export type SimSession = Pick<SessionDoc, "id" | "conference" | "title" | "starts_at" | "ends_at" | "room" | "building" | "kind">;

const TALK_ROOMS = [
  "Grand Ballroom ACE", "Grand Ballroom BDF", "Grand Ballroom H", "Grand Ballroom GI", "151",
  "250 A-C", "250 D-F", "251 A-C", "251 D-F", "254", "255 BC", "255 EF",
  "Salt Lake Ballroom C", "Salt Lake Ballroom DE", "Regency Ballroom CD",
];
const KEYNOTE_ROOM = "Hall DE";
const EXPO_ROOM = "Halls A-C, Halls 1-5";
/** How packed each room tends to get (0..1). The big ballrooms and 255 EF draw crowds. */
const POPULARITY: Record<string, number> = {
  "Grand Ballroom H": 0.97, "255 EF": 0.93, "Grand Ballroom ACE": 0.85, "Salt Lake Ballroom DE": 0.8,
  "Grand Ballroom BDF": 0.7, "255 BC": 0.72, "Regency Ballroom CD": 0.62, "Grand Ballroom GI": 0.6,
};

/** Small seeded PRNG (mulberry32) so the history is identical on every seed run. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A minute offset peaked at `mode`, between `lo` and `hi` (triangular distribution). */
function tri(r: () => number, lo: number, mode: number, hi: number): number {
  const u = r();
  const c = (mode - lo) / (hi - lo);
  return u < c ? lo + Math.sqrt(u * (hi - lo) * (mode - lo)) : hi - Math.sqrt((1 - u) * (hi - lo) * (hi - mode));
}

export function buildSimulatedSignals(sessions: SimSession[], day: string, untilLocal = "14:30"): RoomSignalDoc[] {
  const r = rng(20261110);
  const start = new Date(localToZonedIso(`${day}T08:00`)).getTime();
  const end = new Date(localToZonedIso(`${day}T${untilLocal}`)).getTime();
  const docs: RoomSignalDoc[] = [];

  const emit = (s: SimSession, signal: RoomSignalKind, at: number) => {
    if (at < start || at > end) return;
    docs.push({
      "@timestamp": new Date(Math.round(at / 1000) * 1000).toISOString(),
      conference: s.conference,
      session_id: s.id,
      room: s.room,
      building: s.building,
      signal,
      source: SIMULATED_SOURCE,
      location: roomLocation(s.room, s.building),
    });
  };
  const burst = (s: SimSession, signal: RoomSignalKind, n: number, base: number, lo: number, mode: number, hi: number) => {
    for (let i = 0; i < n; i++) emit(s, signal, base + tri(r, lo, mode, hi) * 60_000);
  };
  const t0 = (s: SimSession) => new Date(s.starts_at).getTime();
  const minutes = (s: SimSession) => (new Date(s.ends_at).getTime() - t0(s)) / 60_000;

  // Keynote rush: everyone pours into Hall DE before 9:00.
  const keynote = sessions.filter((s) => s.room === KEYNOTE_ROOM).sort((a, b) => t0(a) - t0(b))[0];
  if (keynote) {
    burst(keynote, "checkin", 260, t0(keynote), -40, -6, 20);
    burst(keynote, "crowded", 8, t0(keynote), -15, -4, 6);
    burst(keynote, "full", 3, t0(keynote), -3, 0, 4);
  }

  // Lunch rush in the expo halls, plus a steady trickle all day.
  const expo = sessions.filter((s) => s.room === EXPO_ROOM).sort((a, b) => minutes(b) - minutes(a))[0];
  if (expo) {
    const noon = new Date(localToZonedIso(`${day}T12:00`)).getTime();
    burst(expo, "checkin", 170, noon, 0, 40, 95);
    burst(expo, "crowded", 6, noon, 15, 35, 60);
    burst(expo, "checkin", 70, t0(expo), 0, 60, 225);
  }

  // Breakout talks: check-ins in the 15 minutes before each start; popular rooms get crowded or full.
  for (const s of sessions) {
    if (s.kind !== "talk" || !TALK_ROOMS.includes(s.room) || minutes(s) > 90) continue;
    const pop = POPULARITY[s.room] ?? 0.3 + r() * 0.3;
    burst(s, "checkin", Math.round(pop * 45 + r() * 10), t0(s), -15, -3, 6);
    if (pop > 0.7) burst(s, "crowded", 1 + Math.floor(r() * 3), t0(s), -6, -2, 2);
    if (pop > 0.9 && r() < 0.8) burst(s, "full", 1, t0(s), 0, 1, 4);
  }

  return docs.sort((a, b) => a["@timestamp"].localeCompare(b["@timestamp"]));
}
