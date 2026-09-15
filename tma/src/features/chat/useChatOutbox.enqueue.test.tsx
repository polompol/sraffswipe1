// @vitest-environment jsdom
import type { PropsWithChildren } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Message } from "@/types/domain";
import { clearChatAccount } from "./chatPersistence";

const RECEIPT = "33333333-3333-4333-8333-333333333333";

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

describe("chat outbox enqueue latency", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    clearChatAccount("u1", "seeker");
  });

  it("resolves submit after runtime enqueue without waiting for the network", async () => {
    let resolveNetwork!: (message: Message) => void;
    const send = vi.fn().mockImplementation(() => new Promise<Message>((resolve) => {
      resolveNetwork = resolve;
    }));
    const { useChatOutbox } = await import("./useChatOutbox");
    const { result } = renderHook(
      () => useChatOutbox({
        matchId: "m1",
        userId: "u1",
        role: "seeker",
        confirmedMessages: [],
        live: false,
        appendConfirmed: vi.fn(),
      }, { send, makeId: () => RECEIPT }),
      { wrapper: wrapper() },
    );

    let accepted: boolean | undefined;
    act(() => {
      void result.current.sendText("Привет").then((value) => { accepted = value; });
    });
    await act(async () => { await Promise.resolve(); });

    expect(accepted).toBe(true);
    expect(send).toHaveBeenCalledTimes(1);

    resolveNetwork({
      id: "srv-1",
      clientMessageId: RECEIPT,
      senderId: "u1",
      text: "Привет",
      isSystem: false,
      createdAt: "2026-09-14T10:00:01Z",
    });
    await act(async () => { await Promise.resolve(); });
  });
});