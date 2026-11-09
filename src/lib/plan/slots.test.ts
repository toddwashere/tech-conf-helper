import { describe, expect, it } from "vitest";
import { computeConflicts, findSlotFor, moveChoice, overlaps, rankLabel } from "./slots";

const t = (hm: string) => `2026-11-10T${hm}:00-07:00`;

describe("slots", () => {
  it("treats back-to-back talks as not overlapping", () => {
    expect(overlaps({ start: t("14:00"), end: t("14:50") }, { start: t("14:50"), end: t("15:20") })).toBe(false);
    expect(overlaps({ start: t("14:00"), end: t("14:51") }, { start: t("14:50"), end: t("15:20") })).toBe(true);
  });

  it("puts a workshop that starts with the slot into that slot, and a later talk into a new one", () => {
    const slots = [
      { slotStart: t("14:50"), slotEnd: t("15:20") },
      { slotStart: t("15:35"), slotEnd: t("16:05") },
    ];
    expect(findSlotFor({ start: t("14:50"), end: t("16:10") }, slots)?.slotStart).toBe(t("14:50"));
    expect(findSlotFor({ start: t("16:20"), end: t("16:50") }, slots)).toBeNull();
  });

  it("flags slots whose Plan A talks overlap", () => {
    const c = computeConflicts([
      { slotStart: t("14:50"), planA: { start: t("14:50"), end: t("16:10") } },
      { slotStart: t("15:35"), planA: { start: t("15:35"), end: t("16:05") } },
      { slotStart: t("16:20"), planA: { start: t("16:20"), end: t("16:50") } },
    ]);
    expect(c.get(t("14:50"))).toEqual([t("15:35")]);
    expect(c.get(t("16:20"))).toEqual([]);
  });

  it("labels and reorders choices", () => {
    expect(rankLabel(2)).toBe("Plan C");
    expect(moveChoice(["a", "b", "c"], "c", "up")).toEqual(["a", "c", "b"]);
    expect(moveChoice(["a", "b"], "a", "up")).toEqual(["a", "b"]);
  });
});
