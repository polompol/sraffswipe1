// @vitest-environment jsdom
import type { PropsWithChildren } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/api/client";
import type { Message } from "@/types/domain";
import { clearChatAccount, loadOutbox } from "./chatPersistence";

const RECEIPT = "11111111-1111-4111-8111-111111111111";
const RECEIPT_2 = "22222222-2222-4222-8222-222222222222";

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

function confirmed(receipt = RECEIPT): Message {
  return {
    id: `srv-${receipt.slice(0, 4)}`,
    clientMessageId: receipt,
    senderId: "u1",
    text: "Привет",
    isSystem: false,
    createdAt: "2026-09-14T10:00:05Z",
  };
}

function httpError(status: number) {
  return new ApiError(
    `HTTP ${status}`,
    { url: "/matches/m1/messages", method: "POST" },
    { status, data: { detail: "test" } },
  );
}

describe("chat outbox", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    clearChatAccount("u1", "seeker");
  });

  it("creates one receipt and removes the entry after success", async () => {
    const send = vi.fn().mockResolvedValue(confirmed());
    const makeId = vi.fn().mockReturnValue(RECEIPT);
    const appendConfirmed = vi.fn();
    const { useChatOutbox } = await import("./useChatOutbox");
    const { result } = renderHook(
      () => useChatOutbox({
        matchId: "m1", userId: "u1", role: "seeker",
        confirmedMessages: [], live: true, appendConfirmed,
      }, { send, makeId }),
      { wrapper: wrapper() },
    );

    await act(async () => { await result.current.sendText(" Привет "); });

    expect(makeId).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith("m1", {
      text: "Привет",
      clientMessageId: RECEIPT,
    });
    expect(appendConfirmed).toHaveBeenCalledWith(confirmed());
    expect(result.current.entries).toEqual([]);
    expect(loadOutbox("u1", "seeker", "m1")).toEqual([]);
  });

  it("keeps an ambiguous network failure and manual retry reuses the receipt", async () => {
    const send = vi.fn()
      .mockRejectedValueOnce(new ApiError("Нет связи", { url: "/x", method: "POST" }))
      .mockResolvedValueOnce(confirmed());
    const makeId = vi.fn().mockReturnValue(RECEIPT);
    const appendConfirmed = vi.fn();
    const { useChatOutbox } = await import("./useChatOutbox");
    const { result } = renderHook(
      () => useChatOutbox({
        matchId: "m1", userId: "u1", role: "seeker",
        confirmedMessages: [], live: false, appendConfirmed,
      }, { send, makeId }),
      { wrapper: wrapper() },
    );

    await act(async () => { await result.current.sendText("Привет"); });
    expect(result.current.entries).toEqual([
      expect.objectContaining({ clientMessageId: RECEIPT, status: "failed", lastError: "network" }),
    ]);

    await act(async () => { await result.current.retry(RECEIPT); });

    expect(makeId).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenNthCalledWith(2, "m1", {
      text: "Привет",
      clientMessageId: RECEIPT,
    });
    expect(result.current.entries).toEqual([]);
  });

  it("reconciles a failed item from server history without another POST", async () => {
    const send = vi.fn().mockRejectedValue(new ApiError("Нет связи", { url: "/x", method: "POST" }));
    const { useChatOutbox } = await import("./useChatOutbox");
    const props = { messages: [] as Message[] };
    const { result, rerender } = renderHook(
      () => useChatOutbox({
        matchId: "m1", userId: "u1", role: "seeker",
        confirmedMessages: props.messages, live: false, appendConfirmed: vi.fn(),
      }, { send, makeId: () => RECEIPT }),
      { wrapper: wrapper() },
    );

    await act(async () => { await result.current.sendText("Привет"); });
    expect(send).toHaveBeenCalledTimes(1);

    props.messages = [confirmed()];
    rerender();
    await waitFor(() => expect(result.current.entries).toEqual([]));

    expect(send).toHaveBeenCalledTimes(1);
    expect(loadOutbox("u1", "seeker", "m1")).toEqual([]);
  });

  it("403 blocks the item and never retries it automatically", async () => {
    const send = vi.fn().mockRejectedValue(httpError(403));
    const { useChatOutbox } = await import("./useChatOutbox");
    const props = { live: false };
    const { result, rerender } = renderHook(
      () => useChatOutbox({
        matchId: "m1", userId: "u1", role: "seeker",
        confirmedMessages: [], live: props.live, appendConfirmed: vi.fn(),
      }, { send, makeId: () => RECEIPT }),
      { wrapper: wrapper() },
    );

    await act(async () => { await result.current.sendText("Привет"); });
    expect(result.current.entries[0]).toEqual(expect.objectContaining({
      status: "blocked", lastError: "forbidden",
    }));
    expect(result.current.terminalAccessLost).toBe(true);

    props.live = true;
    rerender();
    await act(async () => { await Promise.resolve(); });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("409 receipt conflict is terminal and does not mint a replacement id", async () => {
    const send = vi.fn().mockRejectedValue(httpError(409));
    const makeId = vi.fn().mockReturnValue(RECEIPT);
    const { useChatOutbox } = await import("./useChatOutbox");
    const { result } = renderHook(
      () => useChatOutbox({
        matchId: "m1", userId: "u1", role: "seeker",
        confirmedMessages: [], live: false, appendConfirmed: vi.fn(),
      }, { send, makeId }),
      { wrapper: wrapper() },
    );

    await act(async () => { await result.current.sendText("Привет"); });
    await act(async () => { await result.current.retry(RECEIPT); });

    expect(makeId).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledTimes(1);
    expect(result.current.entries[0]).toEqual(expect.objectContaining({
      clientMessageId: RECEIPT, status: "blocked", lastError: "integrity",
    }));
  });

  it("429 keeps the same item in cooldown and live reconnect does not hammer", async () => {
    const send = vi.fn().mockRejectedValue(httpError(429));
    const now = vi.fn().mockReturnValue(1_000_000);
    const { useChatOutbox } = await import("./useChatOutbox");
    const props = { live: false };
    const { result, rerender } = renderHook(
      () => useChatOutbox({
        matchId: "m1", userId: "u1", role: "seeker",
        confirmedMessages: [], live: props.live, appendConfirmed: vi.fn(),
      }, { send, makeId: () => RECEIPT, now }),
      { wrapper: wrapper() },
    );

    await act(async () => { await result.current.sendText("Привет"); });
    expect(result.current.entries[0]).toEqual(expect.objectContaining({
      status: "failed", lastError: "rate_limit",
    }));
    const retryAfter = result.current.entries[0].retryAfter!;
    expect(retryAfter).toBeGreaterThan(1_000_000);

    props.live = true;
    rerender();
    await act(async () => { await Promise.resolve(); });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("flushes only unresolved entries for the active match", async () => {
    const { upsertOutbox } = await import("./chatPersistence");
    upsertOutbox("u1", "seeker", {
      clientMessageId: RECEIPT,
      matchId: "m1",
      text: "Активный",
      createdAt: "2026-09-14T10:00:00Z",
      status: "failed",
      attempts: 1,
      lastError: "network",
    });
    upsertOutbox("u1", "seeker", {
      clientMessageId: RECEIPT_2,
      matchId: "m2",
      text: "Другой чат",
      createdAt: "2026-09-14T10:00:00Z",
      status: "failed",
      attempts: 1,
      lastError: "network",
    });
    const send = vi.fn().mockResolvedValue(confirmed(RECEIPT));
    const { useChatOutbox } = await import("./useChatOutbox");
    const { result } = renderHook(
      () => useChatOutbox({
        matchId: "m1", userId: "u1", role: "seeker",
        confirmedMessages: [], live: true, appendConfirmed: vi.fn(),
      }, { send, makeId: () => RECEIPT }),
      { wrapper: wrapper() },
    );

    await act(async () => { await result.current.flush(); });

    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][1].clientMessageId).toBe(RECEIPT);
    expect(loadOutbox("u1", "seeker", "m2")).toHaveLength(1);
  });
});