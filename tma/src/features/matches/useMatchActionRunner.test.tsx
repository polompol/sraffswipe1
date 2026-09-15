// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useMatchActionRunner } from "./useMatchActionRunner";

describe("useMatchActionRunner", () => {
  it("marks an action pending immediately and suppresses a rapid duplicate", async () => {
    const { result } = renderHook(() => useMatchActionRunner());
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    const mutate = vi.fn(() => pending);

    let first!: Promise<boolean>;
    let second!: Promise<boolean>;
    act(() => {
      first = result.current.run("m1", "confirm", mutate);
      second = result.current.run("m1", "confirm", mutate);
    });

    expect(mutate).toHaveBeenCalledTimes(1);
    expect(result.current.isPending("m1", "confirm")).toBe(true);
    await expect(second).resolves.toBe(false);

    await act(async () => {
      release();
      await first;
    });
    expect(result.current.isPending("m1", "confirm")).toBe(false);
  });

  it("clears pending after failure and permits a deliberate retry", async () => {
    const { result } = renderHook(() => useMatchActionRunner());
    const mutate = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(undefined);

    await act(async () => {
      await expect(result.current.run("m1", "cancel", mutate)).rejects.toThrow("offline");
    });
    expect(result.current.isPending("m1", "cancel")).toBe(false);

    await act(async () => {
      await expect(result.current.run("m1", "cancel", mutate)).resolves.toBe(true);
    });
    expect(mutate).toHaveBeenCalledTimes(2);
  });

  it("tracks pending independently per match and action", async () => {
    const { result } = renderHook(() => useMatchActionRunner());
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });

    let first!: Promise<boolean>;
    act(() => {
      first = result.current.run("m1", "checkin", () => pending);
    });

    expect(result.current.isPending("m1", "checkin")).toBe(true);
    expect(result.current.isPending("m1", "dispute")).toBe(false);
    expect(result.current.isPending("m2", "checkin")).toBe(false);

    await act(async () => {
      release();
      await first;
    });
  });
});
