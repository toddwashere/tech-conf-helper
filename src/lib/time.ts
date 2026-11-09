export const DEFAULT_TIME_ZONE = process.env.CONFERENCE_TZ ?? "America/Denver";

function zoneOffsetMinutes(utcMillis: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(utcMillis));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return Math.round((asUtc - utcMillis) / 60000);
}

function formatOffset(minutes: number): string {
  const sign = minutes < 0 ? "-" : "+";
  const abs = Math.abs(minutes);
  const hh = String(Math.floor(abs / 60)).padStart(2, "0");
  const mm = String(abs % 60).padStart(2, "0");
  return `${sign}${hh}:${mm}`;
}

const NAIVE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;

/** Converts a wall-clock time with no offset (e.g. "2026-11-10T14:50:00") into an ISO string with the zone's offset. */
export function localToZonedIso(naive: string, timeZone: string = DEFAULT_TIME_ZONE): string {
  const m = NAIVE.exec(naive);
  if (!m) throw new Error(`Expected a local date-time without offset, got "${naive}"`);
  const [, y, mo, d, h, mi, s = "00"] = m;
  const wallAsUtc = Date.UTC(+y, +mo - 1, +d, +h, +mi, +s);
  let offset = zoneOffsetMinutes(wallAsUtc, timeZone);
  offset = zoneOffsetMinutes(wallAsUtc - offset * 60000, timeZone);
  return `${y}-${mo}-${d}T${h}:${mi}:${s}${formatOffset(offset)}`;
}

export function formatTimeInZone(iso: string, timeZone: string = DEFAULT_TIME_ZONE): string {
  return new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", minute: "2-digit" }).format(new Date(iso));
}

export function formatDayInZone(iso: string, timeZone: string = DEFAULT_TIME_ZONE): string {
  return new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short", month: "short", day: "numeric" }).format(
    new Date(iso),
  );
}
