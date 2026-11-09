/** Pure helpers for plan slots: overlap, slot assignment, conflicts, labels. */

export interface TimeRange {
  start: string;
  end: string;
}

const ms = (iso: string) => new Date(iso).getTime();

/** Half-open overlap: a talk ending at 2:50 doesn't conflict with one starting at 2:50. */
export function overlaps(a: TimeRange, b: TimeRange): boolean {
  return ms(a.start) < ms(b.end) && ms(b.start) < ms(a.end);
}

export function rankLabel(rank: number): string {
  return `Plan ${String.fromCharCode(65 + Math.max(0, Math.min(rank, 25)))}`;
}

export interface SlotRef {
  slotStart: string;
  slotEnd: string;
}

/**
 * A new choice joins the existing slot it overlaps the most (so a 25-minute talk and an
 * 80-minute workshop starting together share a slot); otherwise it opens a new slot.
 */
export function findSlotFor(session: TimeRange, slots: SlotRef[]): SlotRef | null {
  let best: SlotRef | null = null;
  let bestOverlap = 0;
  for (const slot of slots) {
    const overlap =
      Math.min(ms(session.end), ms(slot.slotEnd)) - Math.max(ms(session.start), ms(slot.slotStart));
    if (overlap > bestOverlap) {
      best = slot;
      bestOverlap = overlap;
    }
  }
  return best;
}

/** For each slot, the other slots whose Plan A overlaps its Plan A in time. */
export function computeConflicts(slots: { slotStart: string; planA: TimeRange | null }[]): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const a of slots) {
    out.set(
      a.slotStart,
      slots
        .filter((b) => b.slotStart !== a.slotStart && a.planA && b.planA && overlaps(a.planA, b.planA))
        .map((b) => b.slotStart),
    );
  }
  return out;
}

/** Moves one id up or down by one position; returns a new array. */
export function moveChoice(ids: string[], id: string, direction: "up" | "down"): string[] {
  const i = ids.indexOf(id);
  const j = direction === "up" ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= ids.length) return [...ids];
  const next = [...ids];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}
