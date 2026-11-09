import { describe, expect, it } from "vitest";
import { extractCitations } from "./citations";

describe("extractCitations", () => {
  const results = [
    {
      type: "esql_results",
      data: {
        columns: [{ name: "id" }, { name: "title" }, { name: "room" }],
        values: [
          ["kc:1", "eBPF for Humans", "Hall A"],
          ["kc:2", "GPU Scheduling Deep Dive", "Hall B"],
          ["kc:3", "Never Mentioned", "Hall C"],
        ],
      },
    },
    { type: "resource", data: { reference: { id: "kc:4" }, content: { title: "Platform Teams at Scale", id: "kc:4" } } },
  ];

  it("keeps only sessions the answer names, in answer order", () => {
    const answer = "Go to **GPU Scheduling Deep Dive**, then **platform teams at scale**. Backup: eBPF for Humans.";
    expect(extractCitations(answer, results).map((c) => c.id)).toEqual(["kc:2", "kc:4", "kc:1"]);
  });

  it("returns nothing when no tool ran", () => {
    expect(extractCitations("Hello", [])).toEqual([]);
  });
});
