import { describe, expect, it } from "vitest";
import { buildDayFilter, buildMemorySearchRequest } from "./memory-search";

describe("buildDayFilter", () => {
  it("matches the day's sessions, or loose memories written that Mountain-time day", () => {
    const f = buildDayFilter("2026-11-10", ["s1"]);
    const should = f?.bool?.should as Record<string, unknown>[];
    expect(should[0]).toEqual({ terms: { session_id: ["s1"] } });
    expect(JSON.stringify(should[1])).toContain('"gte":"2026-11-10T00:00:00-07:00"');
    expect(JSON.stringify(should[1])).toContain('"lt":"2026-11-11T00:00:00-07:00"');
  });
});

describe("buildMemorySearchRequest", () => {
  it("uses RRF over keyword and semantic retrievers, both filtered", () => {
    const req = buildMemorySearchRequest("gpu cost", [{ term: { type: "note" } }], 10);
    const retrievers = req.retriever!.rrf!.retrievers;
    expect(retrievers).toHaveLength(2);
    expect(JSON.stringify(retrievers[1])).toContain('"semantic":{"field":"content","query":"gpu cost"}');
    expect(JSON.stringify(retrievers)).toContain('"type":"note"');
  });

  it("falls back to newest-first without a query", () => {
    const req = buildMemorySearchRequest("  ", [], 10);
    expect(req.retriever).toBeUndefined();
    expect(req.sort).toEqual([{ created_at: "desc" }]);
  });
});
