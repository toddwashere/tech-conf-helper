import { describe, expect, it } from "vitest";
import type { PlanChoice, RerouteCandidate, SessionDoc } from "../types";
import { pickReroute, rankSimilar } from "./reroute";

function session(id: string, over: Partial<SessionDoc> = {}): SessionDoc {
  return {
    id,
    conference: "kubecon-na-2026",
    source: "sessionize",
    source_id: id,
    title: `Talk ${id}`,
    description: "",
    content: "",
    starts_at: "2026-11-10T14:50:00-07:00",
    ends_at: "2026-11-10T15:20:00-07:00",
    day: "2026-11-10",
    room: "255 EF",
    building: "Salt Palace",
    room_level: "Level 2",
    tracks: [],
    topics: [],
    level: null,
    kind: "talk",
    full: false,
    speakers: [],
    speaker_names: [],
    links: [],
    ...over,
  };
}

function choice(rank: number, s: SessionDoc, full = false): PlanChoice {
  return { rank, label: "", session: s, full, fullReason: full ? "signal" : null, fullSince: full ? "2026-11-10T14:41:00-07:00" : null };
}

function cand(s: SessionDoc, score: number, sameBuilding: boolean, distanceM = 100): RerouteCandidate {
  return { session: s, score, sameBuilding, distanceM };
}

describe("pickReroute", () => {
  it("does nothing while Plan A is open", () => {
    expect(pickReroute([choice(0, session("a")), choice(1, session("b"))], [])).toBeNull();
  });

  it("goes to Plan B when Plan A is full", () => {
    const r = pickReroute([choice(0, session("a"), true), choice(1, session("b", { room: "Grand Ballroom H" }))], []);
    expect(r?.kind).toBe("backup");
    expect(r?.session?.id).toBe("b");
    expect(r?.reason).toContain("Plan A “Talk a” was reported full at 2:41 PM");
    expect(r?.reason).toContain("Go to Plan B");
  });

  it("skips full backups and says so", () => {
    const r = pickReroute(
      [choice(0, session("a"), true), choice(1, session("b"), true), choice(2, session("c"))],
      [cand(session("x"), 9, true)],
    );
    expect(r?.session?.id).toBe("c");
    expect(r?.rank).toBe(2);
    expect(r?.reason).toContain("Plan B is full too");
  });

  it("falls back to the most similar open talk, preferring the same building", () => {
    const r = pickReroute(
      [choice(0, session("a"), true), choice(1, session("b"), true)],
      [
        cand(session("hyatt", { building: "Hyatt Regency" }), 10, false, 350),
        cand(session("palace", { room: "254" }), 8.5, true, 60),
      ],
    );
    expect(r?.kind).toBe("similar");
    expect(r?.session?.id).toBe("palace");
    expect(r?.reason).toContain("every backup is full");
    expect(r?.reason).toContain("same building (Salt Palace)");
  });

  it("never suggests a talk that's already in the plan or full", () => {
    const r = pickReroute(
      [choice(0, session("a"), true)],
      [cand(session("a"), 20, true), cand(session("soldout", { full: true }), 15, true), cand(session("ok"), 5, false)],
    );
    expect(r?.session?.id).toBe("ok");
    expect(r?.reason).toContain("you have no backup");
  });

  it("reports when there is nowhere to go", () => {
    const r = pickReroute([choice(0, session("a"), true)], []);
    expect(r?.kind).toBe("none");
    expect(r?.session).toBeNull();
  });
});

describe("rankSimilar", () => {
  it("lets a much better match in another building win over a weak same-building one", () => {
    const ranked = rankSimilar([cand(session("near"), 3, true), cand(session("far"), 10, false)]);
    expect(ranked.map((c) => c.session.id)).toEqual(["far"]);
  });
});
