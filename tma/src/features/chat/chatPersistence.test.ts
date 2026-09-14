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

describe("chat persistence", () => {
  beforeEach(() => localStorage.clear());

  it("stores independent drafts per match and account", async () => {
    const p = await api();
    p.saveDraft(userId, role, "m1", "Первый");
    p.saveDraft(userId, role, "m2", "Второй");
    p.saveDraft("u2", role, "m1", "Чужой");

    expect(p.loadDraft(userId, role, "m1")).toBe("Первый");
    expect(p.loadDraft(userId, role, "m2")).toBe("Второй");
    expect(p.loadDraft("u2", role, "m1")).toBe("Чужой");
  });

  it("removes an empty draft instead of keeping dead keys", async () => {
    const p = await api();
    p.saveDraft(userId, role, "m1", "Текст");
    p.saveDraft(userId, role, "m1", "");
    expect(p.loadDraft(userId, role, "m1")).toBe("");
    const raw = JSON.parse(localStorage.getItem(p.chatStorageKey(userId, role))!);
    expect(raw.drafts.m1).toBeUndefined();
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

  it("sanitizes corrupt/oversized persisted values", async () => {
    const p = await api();
    const key = p.chatStorageKey(userId, role);
    localStorage.setItem(key, JSON.stringify({
      version: 1,
      drafts: { m1: "x".repeat(2500), bad: 42 },
      outbox: [
        entry("ok", "m1", "y".repeat(2500)),
        { clientMessageId: "bad", matchId: "m1", text: "x", status: "mystery" },
      ],
    }));

    const state = p.loadChatState(userId, role);
    expect(state.drafts.m1).toHaveLength(2000);
    expect(state.drafts.bad).toBeUndefined();
    expect(state.outbox).toHaveLength(1);
    expect(state.outbox[0].text).toHaveLength(2000);
    expect(state.outbox[0].clientMessageId).toBe("ok");
  });

  it("recovers from invalid JSON without throwing", async () => {
    const p = await api();
    localStorage.setItem(p.chatStorageKey(userId, role), "{broken");
    expect(p.loadChatState(userId, role)).toEqual({ version: 1, drafts: {}, outbox: [] });
  });
});
