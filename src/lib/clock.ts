/**
 * Demo clock. The conference starts tomorrow, so the demo needs a "now" that can be pinned:
 * `?at=2026-11-10T14:45:00-07:00` on a request wins, then `DEMO_NOW` in the env, then the real time.
 */
export const DEMO_NOW_EXAMPLE = "2026-11-10T14:45:00-07:00";

export function parseInstant(value: string | null | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function getNow(override?: string | null): Date {
  return parseInstant(override) ?? parseInstant(process.env.DEMO_NOW) ?? new Date();
}

/** True when "now" is pinned (by request or env) rather than the wall clock. */
export function isDemoClock(override?: string | null): boolean {
  return parseInstant(override) !== null || parseInstant(process.env.DEMO_NOW) !== null;
}

export function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}
