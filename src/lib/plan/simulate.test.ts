import { describe, expect, it } from "vitest";
import { buildSimulatedSignals, type SimSession } from "./simulate";

const s = (id: string, room: string, start: string, end: string): SimSession => ({
  id,
  conference: "kubecon-na-2026",
  title: id,
  room,
  building: "Salt Palace",
  kind: "talk",
  starts_at: `2026-11-10T${start}:00-07:00`,
  ends_at: `2026-11-10T${end}:00-07:00`,
});

const sessions = [
  s("keynote", "Hall DE", "09:00", "09:31"),
  s("expo", "Halls A-C, Halls 1-5", "10:45", "17:15"),
  s("hot", "Grand Ballroom H", "11:30", "12:00"),
  s("quiet", "254", "11:30", "12:00"),
  s("demo", "255 EF", "14:50", "15:20"),
];

describe("buildSimulatedSignals", () => {
  const docs = buildSimulatedSignals(sessions, "2026-11-10");

  it("is deterministic and tagged simulated", () => {
    expect(buildSimulatedSignals(sessions, "2026-11-10")).toEqual(docs);
    expect(docs.every((d) => d.source === "simulated")).toBe(true);
  });

  it("stays inside the window, so the 2:50 PM demo slot has no simulated history", () => {
    const times = docs.map((d) => d["@timestamp"]);
    expect(times[0] >= "2026-11-10T15:00:00.000Z").toBe(true);
    expect(times.at(-1)! <= "2026-11-10T21:30:00.000Z").toBe(true);
    expect(docs.some((d) => d.session_id === "demo")).toBe(false);
  });

  it("has a keynote rush and busier popular rooms", () => {
    const count = (id: string) => docs.filter((d) => d.session_id === id && d.signal === "checkin").length;
    expect(count("keynote")).toBeGreaterThan(200);
    expect(count("hot")).toBeGreaterThan(count("quiet"));
    expect(docs.some((d) => d.session_id === "keynote" && d.signal === "full")).toBe(true);
  });
});
