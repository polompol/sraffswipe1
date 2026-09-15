import { describe, expect, it } from "vitest";
import { remainingFeedItems } from "./feedExhaustion";

type Item = { id: string };

const items = (...ids: string[]): Item[] => ids.map((id) => ({ id }));

describe("feed exhaustion", () => {
  it("keeps an exhausted snapshot hidden regardless of order", () => {
    const exhausted = new Set(["a", "b"]);
    expect(remainingFeedItems(items("a", "b"), exhausted)).toEqual([]);
    expect(remainingFeedItems(items("b", "a"), exhausted)).toEqual([]);
  });

  it("surfaces items that arrive after the exhausted snapshot", () => {
    const exhausted = new Set(["a", "b"]);
    expect(remainingFeedItems(items("a", "b", "c"), exhausted)).toEqual([
      { id: "c" },
    ]);
  });

  it("shows the whole current feed after exhaustion is reset", () => {
    expect(remainingFeedItems(items("a", "b"), new Set())).toEqual(items("a", "b"));
  });
});
