import { describe, expect, it } from "vitest";
import { shouldReconnectChatSocket } from "./useChatSocket";

describe("chat websocket close policy", () => {
  it("does not reconnect after authorization or participant access is revoked", () => {
    expect(shouldReconnectChatSocket(4401)).toBe(false);
    expect(shouldReconnectChatSocket(4403)).toBe(false);
  });

  it("keeps reconnecting after ordinary network/server disconnects", () => {
    expect(shouldReconnectChatSocket(1006)).toBe(true);
    expect(shouldReconnectChatSocket(1011)).toBe(true);
    expect(shouldReconnectChatSocket(1000)).toBe(true);
  });
});
