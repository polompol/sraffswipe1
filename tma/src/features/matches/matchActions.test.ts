import { describe, expect, it } from "vitest";
import { hasMatchAction, hasAnyMatchAction } from "./matchActions";
import type { MatchModel } from "@/types/domain";

function match(allowedActions?: MatchModel["allowedActions"]): MatchModel {
  return {
    id: "m1",
    employerId: "e1",
    vacancyId: "v1",
    status: "confirmed",
    confirmedBySeeker: true,
    confirmedByEmployer: true,
    allowedActions,
  };
}

describe("server-owned match actions", () => {
  it("fails closed when the server did not provide capabilities", () => {
    const m = match(undefined);
    expect(hasMatchAction(m, "cancel")).toBe(false);
    expect(hasAnyMatchAction(m, ["cancel", "set_hours"])).toBe(false);
  });

  it("fails closed while a match is still loading", () => {
    expect(hasMatchAction(null, "confirm")).toBe(false);
    expect(hasAnyMatchAction(undefined, ["confirm", "cancel"])).toBe(false);
  });

  it("shows only actions explicitly granted by the server", () => {
    const m = match(["checkin", "dispute"]);
    expect(hasMatchAction(m, "checkin")).toBe(true);
    expect(hasMatchAction(m, "attendance")).toBe(false);
    expect(hasAnyMatchAction(m, ["cancel", "dispute"])).toBe(true);
  });

  it("does not infer permissions from status", () => {
    const m = match([]);
    expect(m.status).toBe("confirmed");
    expect(hasMatchAction(m, "checkin")).toBe(false);
    expect(hasMatchAction(m, "cancel")).toBe(false);
  });
});
