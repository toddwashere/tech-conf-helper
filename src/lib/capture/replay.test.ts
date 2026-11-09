import { describe, expect, it } from "vitest";
import { buildReplay, splitSentences, TranscriptBuffer } from "./replay";

describe("splitSentences", () => {
  it("splits on sentence punctuation and keeps a trailing fragment", () => {
    expect(splitSentences("Hello there.  How are you?  Fine")).toEqual(["Hello there.", "How are you?", "Fine"]);
  });

  it("returns nothing for blank input", () => {
    expect(splitSentences("   ")).toEqual([]);
  });
});

describe("buildReplay", () => {
  it("emits growing interim captions and one final per sentence", () => {
    const events = buildReplay("One two three. Four five.", 60);
    expect(events.map((e) => e.text)).toEqual(["One", "One two", "One two three.", "Four", "Four five."]);
    expect(events.filter((e) => e.final).map((e) => e.text)).toEqual(["One two three.", "Four five."]);
  });

  it("paces at the given words per minute, strictly increasing", () => {
    const events = buildReplay("a b c d", 120);
    expect(events[0].atMs).toBe(500);
    expect(events.every((e, i) => i === 0 || e.atMs > events[i - 1].atMs)).toBe(true);
  });
});

describe("TranscriptBuffer", () => {
  it("drains finals into one chunk with the first offset, then empties", () => {
    const buf = new TranscriptBuffer();
    buf.add({ text: "First.", offsetMs: 1000 });
    buf.add({ text: "  ", offsetMs: 1500 });
    buf.add({ text: "Second.", offsetMs: 4000 });
    expect(buf.drain()).toEqual({ text: "First. Second.", startsAtMs: 1000, endsAtMs: 4000, sentences: 2 });
    expect(buf.drain()).toBeNull();
  });
});
