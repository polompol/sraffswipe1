// @vitest-environment jsdom
/**
 * Потеря входа должна выключать вход ЦЕЛИКОМ и не оставлять локальную
 * переписку предыдущего аккаунта доступной следующему пользователю устройства.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { getToken } from "@/api/client";
import { LS } from "@/lib/storage";
import { useSession } from "./session";

const chatKey = (role: string, userId: string) => `ss_chat_v1:${role}:${userId}`;

describe("потеря входа", () => {
  beforeEach(() => {
    localStorage.clear();
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
    localStorage.setItem(chatKey("seeker", "u1"), JSON.stringify({
      version: 1,
      drafts: { m1: "Сообщение не должно остаться" },
      outbox: [{ clientMessageId: "c1", matchId: "m1", text: "Черновик" }],
    }));

    useSession.getState().logout();

    expect(localStorage.getItem(chatKey("seeker", "u1"))).toBeNull();
  });

  it("смена аккаунта очищает локальный чат предыдущей личности", () => {
    localStorage.setItem(chatKey("seeker", "u1"), JSON.stringify({
      version: 1,
      drafts: { m1: "Личный текст первого аккаунта" },
      outbox: [],
    }));

    useSession.getState().setAuth("new-token", "employer", "e2");

    expect(localStorage.getItem(chatKey("seeker", "u1"))).toBeNull();
  });

  it("обновление токена того же аккаунта не стирает его черновик", () => {
    const key = chatKey("seeker", "u1");
    localStorage.setItem(key, JSON.stringify({
      version: 1,
      drafts: { m1: "Продолжить позже" },
      outbox: [],
    }));

    useSession.getState().setAuth("refreshed-token", "seeker", "u1");

    expect(localStorage.getItem(key)).not.toBeNull();
  });
});
