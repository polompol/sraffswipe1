// @vitest-environment jsdom
import type { PropsWithChildren } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Message } from "@/types/domain";

const RECEIPT = "11111111-1111-4111-8111-111111111111";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("VITE_USE_BACKEND", "true");
  localStorage.clear();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("chat client receipt contract", () => {
  it("sends client_message_id with the first REST attempt", async () => {
    let sentBody: unknown;
    vi.stubGlobal("fetch", async (_url: string, init: RequestInit = {}) => {
      sentBody = JSON.parse(String(init.body));
      return jsonResponse({
        id: "srv-1",
        client_message_id: RECEIPT,
        match_id: "m1",
        sender_id: "u1",
        text: "Привет",
        is_system: false,
        created_at: "2026-09-14T10:00:00Z",
      });
    });

    const { sendMessage } = await import("@/api/endpoints");
    const sendWithReceipt = sendMessage as unknown as (
      matchId: string,
      input: { text: string; clientMessageId: string },
    ) => Promise<unknown>;

    await sendWithReceipt("m1", {
      text: "Привет",
      clientMessageId: RECEIPT,
    });

    expect(sentBody).toEqual({
      text: "Привет",
      client_message_id: RECEIPT,
    });
  });

  it("keeps client_message_id on a WebSocket message", async () => {
    class FakeWebSocket {
      static latest: FakeWebSocket | null = null;
      onopen: (() => void) | null = null;
      onclose: ((event?: CloseEvent) => void) | null = null;
      onerror: (() => void) | null = null;
      onmessage: ((event: MessageEvent) => void) | null = null;

      constructor(_url: string) {
        FakeWebSocket.latest = this;
      }

      close() {}
    }

    vi.stubGlobal("WebSocket", FakeWebSocket as unknown as typeof WebSocket);
    const { useChatSocket } = await import("./useChatSocket");
    const onMessage = vi.fn();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: PropsWithChildren) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );

    const { unmount } = renderHook(
      () => useChatSocket("m1", {
        onMessage,
        onSystem: vi.fn(),
        onLive: vi.fn(),
      }),
      { wrapper },
    );

    expect(FakeWebSocket.latest).not.toBeNull();
    act(() => {
      FakeWebSocket.latest?.onmessage?.({
        data: JSON.stringify({
          id: "srv-1",
          client_message_id: RECEIPT,
          sender_id: "u1",
          text: "Привет",
          is_system: false,
          created_at: "2026-09-14T10:00:00Z",
        }),
      } as MessageEvent);
    });

    expect(onMessage).toHaveBeenCalledWith(expect.objectContaining({
      id: "srv-1",
      clientMessageId: RECEIPT,
    }));

    unmount();
    client.clear();
  });

  it("replaces the same sender receipt instead of adding a second bubble", async () => {
    vi.stubGlobal("fetch", () => new Promise<Response>(() => {}));
    const { useChatHistory } = await import("./useChatHistory");
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: PropsWithChildren) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const optimistic: Message = {
      id: "old-local-copy",
      clientMessageId: RECEIPT,
      senderId: "u1",
      text: "Привет",
      isSystem: false,
      createdAt: "2026-09-14T10:00:00Z",
    };
    client.setQueryData<Message[]>(["messages", "m1"], [optimistic]);

    const { result, unmount } = renderHook(() => useChatHistory("m1"), { wrapper });
    const confirmed: Message = {
      ...optimistic,
      id: "srv-2",
      createdAt: "2026-09-14T10:00:01Z",
    };

    act(() => result.current.appendMessage(confirmed));

    expect(client.getQueryData<Message[]>(["messages", "m1"])).toEqual([confirmed]);
    unmount();
    client.clear();
  });
});
