import { describe, expect, it } from "vitest";
import { summaryFromMetadata } from "./summarize";

describe("summaryFromMetadata", () => {
  it("reads the shape the session-ended workflow writes (lists as JSON strings)", () => {
    expect(
      summaryFromMetadata({ one_line: "eBPF rollout", takeaways: '["Observe first","Baseline"]', action_items: '["Pin kernels"]' }),
    ).toEqual({ one_line: "eBPF rollout", takeaways: ["Observe first", "Baseline"], action_items: ["Pin kernels"] });
  });

  it("rejects missing or malformed output instead of showing a broken summary", () => {
    expect(summaryFromMetadata(null)).toBeNull();
    expect(summaryFromMetadata({ one_line: "x", takeaways: "not json" })).toBeNull();
    expect(summaryFromMetadata({ one_line: "", takeaways: "[]", action_items: "[]" })).toBeNull();
  });
});
