// @vitest-environment jsdom
/**
 * Потеря входа должна выключать вход ЦЕЛИКОМ и не оставлять runtime-переписку
 * предыдущего аккаунта доступной следующему пользователю устройства.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { getToken } from "@/api/client";
import { LS } from "@/lib/storage";
import {
  clearChatAccount,
  loadDraft,
  loadOutbox,
  saveDraft,
  upsertOutbox,
} from "@/features/chat/chatPersistence";
import { useSession } from "./session";

describe("потеря входа", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    clearChatAccount("u1", "seeker");
    clearChatAccount("e2", "employer");
    useSession.setState({ authenticated: false, role: null, userId: null });
    useSession.getState().setAuth("t0k3n", "seeker", "u1");
  });

  it("сбрасывает и токен, и флаг входа, и роль", () => {
    expect(useSession.getState().authenticated).toBe(true);
    useSession.getState().logout();
    const s = useSession.getState();
    expect(s.authenticated).toBe(false);
    expect(s.role).toBeNull();
    expect(s.userId).toBeNull();
    expect(getToken()).toBeNull();
    expect(localStorage.getItem(LS.role)).toBeNull();
    expect(localStorage.getItem(LS.uid)).toBeNull();
  });

  it("logout удаляет черновики и outbox текущего аккаунта", () => {
    saveDraft("u1", "seeker", "m1", "Сообщение не должно остаться");
    upsertOutbox("u1", "seeker", {
      clientMessageId: "c1",
      matchId: "m1",
      text: "Черновик",
      createdAt: "2026-09-14T10:00:00Z",
      status: "failed",
      attempts: 1,
      lastError: "network",
    });

    useSession.getState().logout();

    expect(loadDraft("u1", "seeker", "m1")).toBe("");
    expect(loadOutbox("u1", "seeker", "m1")).toEqual([]);
  });

  it("смена аккаунта очищает runtime-чат предыдущей личности", () => {
    saveDraft("u1", "seeker", "m1", "Личный текст первого аккаунта");

    useSession.getState().setAuth("new-token", "employer", "e2");

    expect(loadDraft("u1", "seeker", "m1")).toBe("");
  });

  it("обновление токена того же аккаунта не стирает его runtime-черновик", () => {
    saveDraft("u1", "seeker", "m1", "Продолжить позже");

    useSession.getState().setAuth("refreshed-token", "seeker", "u1");

    expect(loadDraft("u1", "seeker", "m1")).toBe("Продолжить позже");
  });
});