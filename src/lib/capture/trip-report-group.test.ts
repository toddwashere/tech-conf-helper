import { describe, expect, it } from "vitest";
import type { MemoryDoc } from "@/lib/types";
import { dayInZone, groupTripReport, type SessionInfo } from "./trip-report-group";

const mem = (p: Partial<MemoryDoc>): MemoryDoc => ({
  id: Math.random().toString(),
  type: "note",
  conference: "c",
  session_id: null,
  source: "t",
  title: null,
  text: "",
  lang: "en",
  starts_at_ms: null,
  metadata: null,
  created_at: "2026-11-10T18:00:00Z",
  ...p,
});

const sessions = new Map<string, SessionInfo>([
  ["s2", { id: "s2", title: "Later talk", starts_at: "2026-11-10T15:00:00-07:00", room: "B", day: "2026-11-10" }],
  ["s1", { id: "s1", title: "Earlier talk", starts_at: "2026-11-10T09:00:00-07:00", room: "A", day: "2026-11-10" }],
  ["s3", { id: "s3", title: "Next day", starts_at: "2026-11-11T09:00:00-07:00", room: "C", day: "2026-11-11" }],
]);

describe("dayInZone", () => {
  it("uses Mountain time, not UTC, near midnight", () => {
    expect(dayInZone("2026-11-11T05:30:00Z")).toBe("2026-11-10");
  });
});

describe("groupTripReport", () => {
  it("groups memories by session and sessions by day in time order", () => {
    const { days, counts } = groupTripReport(
      [
        mem({ session_id: "s3", type: "note", text: "n3" }),
        mem({ session_id: "s2", type: "rating", text: "r", metadata: { score: "4", reason: "solid" } }),
        mem({ session_id: "s1", type: "summary", text: "sum1" }),
        mem({ session_id: "s1", type: "note", text: "n1" }),
        mem({ session_id: "s2", type: "contact", metadata: { name: "Jordan Rivera", role: "SRE" } }),
      ],
      sessions,
    );
    expect(days.map((d) => d.day)).toEqual(["2026-11-10", "2026-11-11"]);
    expect(days[0].sessions.map((s) => s.title)).toEqual(["Earlier talk", "Later talk"]);
    expect(days[0].sessions[0]).toMatchObject({ summary: "sum1", notes: ["n1"] });
    expect(days[0].sessions[1].rating).toEqual({ score: 4, reason: "solid" });
    expect(days[0].sessions[1].contacts[0]).toMatchObject({ name: "Jordan Rivera", role: "SRE", profile_url: null });
    expect(counts).toEqual({ sessions: 3, notes: 2, ratings: 1, contacts: 1, summaries: 1 });
  });

  it("puts memories without a session under their own Mountain-time day and drops invalid ratings", () => {
    const { days, counts } = groupTripReport(
      [
        mem({ type: "note", text: "hallway", created_at: "2026-11-12T04:00:00Z" }),
        mem({ session_id: "s1", type: "rating", metadata: { score: "9" } }),
      ],
      sessions,
    );
    expect(days.map((d) => d.day)).toEqual(["2026-11-10", "2026-11-11"]);
    expect(days[1].sessions[0]).toMatchObject({ title: "Not tied to a session", notes: ["hallway"] });
    expect(counts.ratings).toBe(0);
  });

  it("builds the at-a-glance view: top-rated first, to-dos from notes and summaries, people to follow up", () => {
    const { glance, days } = groupTripReport(
      [
        mem({ session_id: "s1", type: "rating", metadata: { score: "3" } }),
        mem({ session_id: "s2", type: "rating", metadata: { score: "5", reason: "best" } }),
        mem({ session_id: "s3", type: "rating", metadata: { score: "2" } }),
        mem({ session_id: "s1", type: "note", text: "TODO: pin kernels\nnice demo" }),
        mem({ session_id: "s2", type: "summary", text: "x", metadata: { action_items: JSON.stringify(["Pin kernels", "Enable observe-only"]) } }),
        mem({ session_id: "s2", type: "contact", metadata: { name: "Sam Okafor", follow_up: "share dashboard" } }),
      ],
      sessions,
    );
    expect(glance.topTalks.map((t) => [t.title, t.score])).toEqual([["Later talk", 5], ["Earlier talk", 3]]);
    expect(glance.actions.map((a) => a.text)).toEqual(["Pin kernels", "Pin kernels", "Enable observe-only"]);
    expect(days[0].sessions[1].actions).toEqual(["Pin kernels", "Enable observe-only"]);
    expect(glance.followUps).toEqual([
      { name: "Sam Okafor", role: null, follow_up: "share dashboard", profile_url: null, session_title: "Later talk" },
    ]);
  });
});
