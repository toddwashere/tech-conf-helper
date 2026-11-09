import { describe, expect, it } from "vitest";
import { cleanLabel, mapSessionize, parseRoom } from "./sessionize";

const feed = {
  sessions: [
    {
      id: "101",
      title: "eBPF Superpowers for Network Security",
      description: "How Cilium uses eBPF.",
      startsAt: "2026-11-10T14:50:00",
      endsAt: "2026-11-10T15:20:00",
      speakers: ["sp-1"],
      categoryItems: [1, 10, 20],
      questionAnswers: [
        { questionId: 500, answerValue: "https://sessionize.com/download/abc~talk.pdf" },
        { questionId: 501, answerValue: "https://github.com/cilium/cilium" },
        { questionId: 502, answerValue: "https://example.com/logo.png" },
      ],
      roomId: 7,
    },
    {
      id: "102",
      title: "Registration + Badge Pick-Up",
      description: null,
      startsAt: "2026-11-09T08:00:00",
      endsAt: "2026-11-09T17:00:00",
      speakers: [],
      categoryItems: [2],
      questionAnswers: [],
      roomId: 8,
    },
    {
      id: "103",
      title: "CNCF Maintainer Summit [SOLD OUT]",
      description: "",
      startsAt: "2026-11-09T09:00:00",
      endsAt: "2026-11-09T17:00:00",
      speakers: [],
      categoryItems: [],
      questionAnswers: [],
      roomId: null,
    },
    {
      id: "104",
      title: "Unscheduled",
      description: "",
      startsAt: null,
      endsAt: null,
      speakers: [],
      categoryItems: [],
      questionAnswers: [],
      roomId: null,
    },
  ],
  speakers: [
    {
      id: "sp-1",
      fullName: " Ada Lovelace ",
      bio: "Engineer.",
      tagLine: "Isovalent",
      profilePicture: null,
      links: [{ title: "LinkedIn", url: "https://linkedin.com/in/ada", linkType: "LinkedIn" }],
      sessions: [101],
    },
  ],
  questions: [
    { id: 500, question: "Presentation Slides", questionType: "File_upload" },
    { id: 501, question: "GitHub Repository", questionType: "Web_address" },
    { id: 502, question: "Event Logo", questionType: "Web_address" },
  ],
  categories: [
    {
      id: 900,
      title: "All Sessions",
      items: [
        { id: 1, name: "Security" },
        { id: 2, name: "☕ Breaks" },
      ],
    },
    { id: 901, title: "Audience Level", items: [{ id: 10, name: "Advanced" }] },
    { id: 902, title: "CNCF Projects", items: [{ id: 20, name: "Cilium" }] },
  ],
  rooms: [
    { id: 7, name: "Salt Palace | Level 1 | Hall DE" },
    { id: 8, name: "Hyatt Regency Lobby" },
  ],
};

const options = { conference: "kubecon-na-2026", source: "test", timeZone: "America/Denver" };

describe("mapSessionize", () => {
  const { sessions, speakers } = mapSessionize(feed, options);
  const talk = sessions.find((s) => s.source_id === "101")!;

  it("skips sessions without a time", () => {
    expect(sessions.map((s) => s.source_id)).toEqual(["101", "102", "103"]);
  });

  it("namespaces ids by conference so re-imports update in place", () => {
    expect(talk.id).toBe("kubecon-na-2026:101");
    expect(talk.speakers[0].id).toBe("kubecon-na-2026:sp-1");
    expect(speakers[0].session_ids).toEqual(["kubecon-na-2026:101"]);
  });

  it("applies the conference time zone", () => {
    expect(talk.starts_at).toBe("2026-11-10T14:50:00-07:00");
    expect(talk.day).toBe("2026-11-10");
  });

  it("splits categories into tracks, level, and topics", () => {
    expect(talk.tracks).toEqual(["Security"]);
    expect(talk.level).toBe("Advanced");
    expect(talk.topics).toEqual(["Cilium"]);
  });

  it("parses room, building, and level", () => {
    expect([talk.building, talk.room_level, talk.room]).toEqual(["Salt Palace", "Level 1", "Hall DE"]);
  });

  it("keeps slide and repo links but drops logos", () => {
    expect(talk.links).toEqual([
      { label: "Slides", url: "https://sessionize.com/download/abc~talk.pdf" },
      { label: "GitHub Repository", url: "https://github.com/cilium/cilium" },
    ]);
  });

  it("marks breaks and registration as logistics", () => {
    expect(sessions.find((s) => s.source_id === "102")!.kind).toBe("logistics");
    expect(talk.kind).toBe("talk");
  });

  it("flags sold-out sessions as full and handles missing rooms", () => {
    const summit = sessions.find((s) => s.source_id === "103")!;
    expect(summit.full).toBe(true);
    expect(summit.room).toBe("Room TBD");
  });

  it("trims speaker names and builds semantic content", () => {
    expect(talk.speaker_names).toEqual(["Ada Lovelace"]);
    expect(talk.content).toContain("How Cilium uses eBPF.");
  });

  it("rejects feeds that are not Sessionize-shaped", () => {
    expect(() => mapSessionize({ foo: 1 }, options)).toThrow();
  });
});

describe("helpers", () => {
  it("strips leading emoji from labels", () => {
    expect(cleanLabel("🚨 Contribfest")).toBe("Contribfest");
  });

  it("handles rooms without separators", () => {
    expect(parseRoom("Room TBD")).toEqual({ building: null, level: null, room: "Room TBD" });
  });
});
