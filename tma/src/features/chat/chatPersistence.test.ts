// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";

async function api() {
  return (await import("./chatPersistence")) as Record<string, any>;
}

const role = "seeker" as const;
const userId = "u1";

function entry(id: string, matchId = "m1", text = `msg-${id}`) {
  return {
    clientMessageId: id,
    matchId,
    text,
    createdAt: "2026-09-14T10:00:00Z",
    status: "failed",
    attempts: 1,
    lastError: "network",
  };
}

describe("chat recovery memory", () => {
  beforeEach(async () => {
    localStorage.clear();
    sessionStorage.clear();
    const p = await api();
    p.clearChatAccount("u1", "seeker");
    p.clearChatAccount("u2", "seeker");
    p.clearChatAccount("u1", "employer");
  });

  it("stores independent drafts per match, account and role for this runtime", async () => {
    const p = await api();
    p.saveDraft(userId, role, "m1", "Первый");
    p.saveDraft(userId, role, "m2", "Второй");
    p.saveDraft("u2", role, "m1", "Чужой");
    p.saveDraft(userId, "employer", "m1", "Другая роль");

    expect(p.loadDraft(userId, role, "m1")).toBe("Первый");
    expect(p.loadDraft(userId, role, "m2")).toBe("Второй");
    expect(p.loadDraft("u2", role, "m1")).toBe("Чужой");
    expect(p.loadDraft(userId, "employer", "m1")).toBe("Другая роль");
  });

  it("removes an empty draft instead of retaining dead runtime state", async () => {
    const p = await api();
    p.saveDraft(userId, role, "m1", "Текст");
    p.saveDraft(userId, role, "m1", "");
    expect(p.loadDraft(userId, role, "m1")).toBe("");
    expect(p.loadChatState(userId, role).drafts.m1).toBeUndefined();
  });

  it("upserts outbox by receipt and removes confirmed receipt", async () => {
    const p = await api();
    p.upsertOutbox(userId, role, entry("c1", "m1", "old"));
    p.upsertOutbox(userId, role, { ...entry("c1", "m1", "new"), attempts: 2 });
    expect(p.loadOutbox(userId, role)).toEqual([
      expect.objectContaining({ clientMessageId: "c1", text: "new", attempts: 2 }),
    ]);

    p.removeOutbox(userId, role, "c1");
    expect(p.loadOutbox(userId, role)).toEqual([]);
  });

  it("filters outbox by active match", async () => {
    const p = await api();
    p.upsertOutbox(userId, role, entry("c1", "m1"));
    p.upsertOutbox(userId, role, entry("c2", "m2"));
    expect(p.loadOutbox(userId, role, "m2").map((x: any) => x.clientMessageId)).toEqual(["c2"]);
  });

  it("caps outbox at the newest 100 entries", async () => {
    const p = await api();
    for (let i = 0; i < 105; i += 1) {
      p.upsertOutbox(userId, role, entry(`c${i}`));
    }
    const rows = p.loadOutbox(userId, role);
    expect(rows).toHaveLength(100);
    expect(rows[0].clientMessageId).toBe("c5");
    expect(rows[99].clientMessageId).toBe("c104");
  });

  it("sanitizes corrupt and oversized runtime values", async () => {
    const p = await api();
    p.saveChatState(userId, role, {
      version: 1,
      drafts: { m1: "x".repeat(2500), bad: 42 },
      outbox: [
        entry("ok", "m1", "y".repeat(2500)),
        { clientMessageId: "bad", matchId: "m1", text: "x", status: "mystery" },
      ],
    } as any);

    const state = p.loadChatState(userId, role);
    expect(state.drafts.m1).toHaveLength(2000);
    expect(state.drafts.bad).toBeUndefined();
    expect(state.outbox).toHaveLength(1);
    expect(state.outbox[0].text).toHaveLength(2000);
    expect(state.outbox[0].clientMessageId).toBe("ok");
  });

  it("clears account runtime state without touching another account", async () => {
    const p = await api();
    p.saveDraft("u1", role, "m1", "Первый");
    p.saveDraft("u2", role, "m1", "Второй");
    p.clearChatAccount("u1", role);

    expect(p.loadDraft("u1", role, "m1")).toBe("");
    expect(p.loadDraft("u2", role, "m1")).toBe("Второй");
  });

  it("scrubs legacy ss_chat_v1 plaintext instead of restoring it", async () => {
    const p = await api();
    const key = p.chatStorageKey(userId, role);
    localStorage.setItem(key, JSON.stringify({
      version: 1,
      drafts: { m1: "старый секрет" },
      outbox: [entry("legacy", "m1", "старое сообщение")],
    }));
    sessionStorage.setItem(key, "старый session secret");

    expect(p.loadChatState(userId, role)).toEqual({ version: 1, drafts: {}, outbox: [] });
    expect(localStorage.getItem(key)).toBeNull();
    expect(sessionStorage.getItem(key)).toBeNull();
  });

  it("never writes chat plaintext to persistent browser storage", async () => {
    const p = await api();
    const draftSecret = "секретный текст черновика";
    const outboxSecret = "секретный текст неопределённой отправки";

    p.saveDraft(userId, role, "m-secret", draftSecret);
    p.upsertOutbox(userId, role, entry("secret-id", "m-secret", outboxSecret));

    expect(p.loadDraft(userId, role, "m-secret")).toBe(draftSecret);
    expect(p.loadOutbox(userId, role, "m-secret")[0].text).toBe(outboxSecret);

    const persistent = [
      ...Object.values(localStorage),
      ...Object.values(sessionStorage),
    ].join(" ");
    expect(persistent).not.toContain(draftSecret);
    expect(persistent).not.toContain(outboxSecret);
  });
});