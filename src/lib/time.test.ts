import { describe, expect, it } from "vitest";
import { formatTimeInZone, localToZonedIso } from "./time";

describe("localToZonedIso", () => {
  it("applies Mountain Standard Time in November", () => {
    expect(localToZonedIso("2026-11-10T14:50:00", "America/Denver")).toBe("2026-11-10T14:50:00-07:00");
  });

  it("applies Mountain Daylight Time in summer", () => {
    expect(localToZonedIso("2026-07-01T09:00", "America/Denver")).toBe("2026-07-01T09:00:00-06:00");
  });

  it("keeps the same instant when formatted back in the zone", () => {
    expect(formatTimeInZone(localToZonedIso("2026-11-10T14:50:00", "America/Denver"), "America/Denver")).toBe("2:50 PM");
  });

  it("rejects strings that already carry an offset", () => {
    expect(() => localToZonedIso("2026-11-10T14:50:00Z")).toThrow();
  });
});
