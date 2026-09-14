// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import {
  clearChatDraft,
  clearChatRecoveryMemory,
  markChatMessageFailed,
  markChatMessageSending,
  queueChatMessage,
  readChatDraft,
  restoreChatOutbox,
  writeChatDraft,
} from "./chatPersistence";
import type { Message } from "@/types/domain";

beforeEach(() => {
  localStorage.clear();
  clearChatRecoveryMemory();
});

describe("черновик чата", () => {
  it("хранится отдельно для каждой смены и пустой текст удаляет ключ", () => {
    writeChatDraft("match-1", "Буду к 10:00");
    writeChatDraft("match-2", "Нужна форма?");

    expect(readChatDraft("match-1")).toBe("Буду к 10:00");
    expect(readChatDraft("match-2")).toBe("Нужна форма?");

    clearChatDraft("match-1");
    expect(readChatDraft("match-1")).toBe("");
    expect(readChatDraft("match-2")).toBe("Нужна форма?");
  });

  it("не переносится между аккаунтами на одном устройстве", () => {
    localStorage.setItem("ss_uid", "user-1");
    writeChatDraft("match-1", "Личный черновик");
    queueChatMessage(
      "match-1",
      "Неопределённая отправка",
      "33333333-3333-4333-8333-333333333333",
    );

    localStorage.setItem("ss_uid", "user-2");
    expect(readChatDraft("match-1")).toBe("");
    expect(restoreChatOutbox("match-1")).toEqual([]);

    localStorage.setItem("ss_uid", "user-1");
    expect(readChatDraft("match-1")).toBe("Личный черновик");
    expect(restoreChatOutbox("match-1")).toHaveLength(1);
  });

  it("никогда не пишет текст переписки в persistent browser storage", () => {
    localStorage.setItem("ss_uid", "user-1");
    writeChatDraft("match-1", "секретный текст черновика");
    queueChatMessage(
      "match-1",
      "секретный текст отправки",
      "44444444-4444-4444-8444-444444444444",
    );

    expect(localStorage.getItem("ss_chat_draft:user-1:match-1")).toBeNull();
    expect(localStorage.getItem("ss_chat_outbox:user-1:match-1")).toBeNull();
    expect(Object.values(localStorage).join(" ")).not.toContain("секретный текст");
  });
});

describe("неопределённая отправка", () => {
  it("retry использует тот же client_message_id", () => {
    const id = "6f8142ee-cdc5-47fb-8c99-2da4d2fe0064";
    queueChatMessage("match-1", "Буду к началу", id);
    markChatMessageFailed("match-1", id);
    const retry = markChatMessageSending("match-1", id);

    expect(retry?.clientMessageId).toBe(id);
    expect(retry?.text).toBe("Буду к началу");
    expect(retry?.status).toBe("sending");
  });

  it("не предлагает повтор уже подтверждённого сервером сообщения", () => {
    const confirmedId = "11111111-1111-4111-8111-111111111111";
    const unknownId = "22222222-2222-4222-8222-222222222222";
    queueChatMessage("match-1", "Первое", confirmedId);
    queueChatMessage("match-1", "Второе", unknownId);

    const server: Message[] = [{
      id: "server-1",
      senderId: "me",
      text: "Первое",
      isSystem: false,
      createdAt: "2026-09-14T18:00:00Z",
      clientMessageId: confirmedId,
    }];

    const restored = restoreChatOutbox("match-1", server);

    expect(restored).toHaveLength(1);
    expect(restored[0].clientMessageId).toBe(unknownId);
    expect(restored[0].status).toBe("failed");
  });
});
