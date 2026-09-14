// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.resetModules();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("отправка сообщения", () => {
  it("передаёт стабильный client_message_id серверу", async () => {
    vi.stubEnv("VITE_USE_BACKEND", "true");
    const post = vi.fn().mockResolvedValue({
      data: {
        id: "server-message-1",
        senderId: "u1",
        text: "Буду к началу смены",
        isSystem: false,
        createdAt: "2026-09-14T18:00:00Z",
        clientMessageId: "6f8142ee-cdc5-47fb-8c99-2da4d2fe0064",
      },
    });
    vi.doMock("./client", () => ({
      api: { post },
      baseURL: "http://localhost:8000",
      postForm: vi.fn(),
    }));

    const { sendMessage } = await import("./endpoints");
    const clientMessageId = "6f8142ee-cdc5-47fb-8c99-2da4d2fe0064";

    await sendMessage("match-1", "Буду к началу смены", clientMessageId);

    expect(post).toHaveBeenCalledWith("/matches/match-1/messages", {
      text: "Буду к началу смены",
      client_message_id: clientMessageId,
    });
  });
});
