import { describe, expect, it } from "vitest";
import { extractActionItems } from "./action-items";

describe("extractActionItems", () => {
  it("keeps to-do style lines and drops the TODO prefix", () => {
    expect(
      extractActionItems([
        "TODO: pin kernel versions",
        "Great demo of the verifier.\n- try observe-only mode on staging",
        "Ask Jordan about alert rules",
        "follow up with Sam on TTFT SLOs",
        "Idea: a dev-only inference pool",
      ]),
    ).toEqual([
      "Pin kernel versions",
      "Try observe-only mode on staging",
      "Ask Jordan about alert rules",
      "Follow up with Sam on TTFT SLOs",
      "A dev-only inference pool",
    ]);
  });

  it("ignores plain notes, words that only start with an action verb, and duplicates", () => {
    expect(extractActionItems(["Trying times for SREs", "The talk was long", "Try X", "try x"])).toEqual(["Try X"]);
  });
});
