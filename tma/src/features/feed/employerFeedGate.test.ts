import { describe, expect, it } from "vitest";
import { employerFeedState } from "./employerFeedGate";

describe("employer feed prerequisite", () => {
  it("never blocks a seeker", () => {
    expect(employerFeedState(true, undefined, true, true)).toBe("ready");
  });

  it("fails closed while employer vacancies are still unknown", () => {
    expect(employerFeedState(false, undefined, true, false)).toBe("loading");
    expect(employerFeedState(false, undefined, false, false)).toBe("loading");
  });

  it("shows retry instead of candidates when vacancy lookup failed", () => {
    expect(employerFeedState(false, undefined, false, true)).toBe("error");
  });

  it("requires at least one vacancy before candidate actions are enabled", () => {
    expect(employerFeedState(false, [], false, false)).toBe("needs_vacancy");
    expect(employerFeedState(false, [{ id: "v1" }], false, false)).toBe("ready");
  });
});
