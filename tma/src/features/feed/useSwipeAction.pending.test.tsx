// @vitest-environment jsdom
import type { PropsWithChildren } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Vacancy } from "@/types/domain";

const api = vi.hoisted(() => ({
  sendSwipe: vi.fn(),
  track: vi.fn(),
}));
const ui = vi.hoisted(() => ({
  toast: vi.fn(),
  pop: vi.fn(),
}));

vi.mock("@/api/endpoints", () => ({
  sendSwipe: api.sendSwipe,
  track: api.track,
}));
vi.mock("@/components/Toast", () => ({ toast: ui.toast }));
vi.mock("@/lib/sfx", () => ({ pop: ui.pop }));

import { useSwipeAction } from "./useSwipeAction";

function wrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const vacancy = { id: "vac-1" } as Vacancy;

afterEach(() => {
  vi.clearAllMocks();
});

describe("swipe single-flight", () => {
  it("два одинаковых свайпа до ответа сети отправляют один запрос, а после ответа повтор разрешён", async () => {
    const gate = deferred<{ matched: boolean }>();
    api.sendSwipe.mockReturnValueOnce(gate.promise);
    const { result } = renderHook(() => useSwipeAction(true), { wrapper: wrapper() });

    let first!: Promise<boolean>;
    let second!: Promise<boolean>;
    act(() => {
      first = result.current.swipe(vacancy, "like");
      second = result.current.swipe(vacancy, "like");
    });

    expect(api.sendSwipe).toHaveBeenCalledTimes(1);
    expect(api.sendSwipe).toHaveBeenCalledWith("vac-1", "vacancy", "like");

    gate.resolve({ matched: false });
    await act(async () => {
      await expect(first).resolves.toBe(true);
      await expect(second).resolves.toBe(true);
    });

    api.sendSwipe.mockResolvedValueOnce({ matched: false });
    await act(async () => {
      await expect(result.current.swipe(vacancy, "like")).resolves.toBe(true);
    });
    expect(api.sendSwipe).toHaveBeenCalledTimes(2);
  });

  it("ошибка очищает single-flight и разрешает осознанный повтор", async () => {
    const gate = deferred<{ matched: boolean }>();
    api.sendSwipe.mockReturnValueOnce(gate.promise);
    const { result } = renderHook(() => useSwipeAction(true), { wrapper: wrapper() });

    let first!: Promise<boolean>;
    act(() => {
      first = result.current.swipe(vacancy, "like");
    });
    gate.reject(new Error("offline"));
    await act(async () => {
      await expect(first).rejects.toThrow("offline");
    });

    api.sendSwipe.mockResolvedValueOnce({ matched: false });
    await act(async () => {
      await expect(result.current.swipe(vacancy, "like")).resolves.toBe(true);
    });

    expect(api.sendSwipe).toHaveBeenCalledTimes(2);
  });
});
