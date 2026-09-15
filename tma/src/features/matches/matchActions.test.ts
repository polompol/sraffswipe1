import { describe, expect, it, vi } from "vitest";
import { createMatchActionLock, hasMatchAction, hasAnyMatchAction } from "./matchActions";
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

describe("lifecycle action lock", () => {
  it("runs only one mutation for two rapid taps on the same match action", async () => {
    const lock = createMatchActionLock();
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    const mutate = vi.fn(() => pending);

    const first = lock.run("m1", "confirm", mutate);
    const second = lock.run("m1", "confirm", mutate);

    expect(mutate).toHaveBeenCalledTimes(1);
    expect(lock.isPending("m1", "confirm")).toBe(true);
    await expect(second).resolves.toBe(false);

    release();
    await expect(first).resolves.toBe(true);
    expect(lock.isPending("m1", "confirm")).toBe(false);
  });

  it("releases the action after an error so a deliberate retry can run", async () => {
    const lock = createMatchActionLock();
    const mutate = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(undefined);

    await expect(lock.run("m1", "checkin", mutate)).rejects.toThrow("offline");
    expect(lock.isPending("m1", "checkin")).toBe(false);

    await expect(lock.run("m1", "checkin", mutate)).resolves.toBe(true);
    expect(mutate).toHaveBeenCalledTimes(2);
  });

  it("does not block a different action or another match", async () => {
    const lock = createMatchActionLock();
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });

    const first = lock.run("m1", "confirm", () => pending);
    await expect(lock.run("m1", "cancel", async () => undefined)).resolves.toBe(true);
    await expect(lock.run("m2", "confirm", async () => undefined)).resolves.toBe(true);

    release();
    await expect(first).resolves.toBe(true);
  });
});
