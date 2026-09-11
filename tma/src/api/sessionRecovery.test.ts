// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, getToken } from "./client";
import { useSession } from "@/store/session";
import { queryClient } from "@/lib/queryClient";

vi.mock("@tma.js/sdk-react", () => ({ retrieveRawInitData: () => "signed-init-data" }));

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { "Content-Type": "application/json" },
  });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

const fresh = { access_token: "fresh", role: "seeker", user_id: "u1" };

beforeEach(() => {
  useSession.getState().setAuth("expired", "seeker", "u1");
  location.hash = "#/matches";
});
afterEach(() => {
  useSession.getState().logout();
  vi.unstubAllGlobals();
});

describe("восстановление сессии", () => {
  it("одновременные отказы используют один вход и повторяют оба запроса", async () => {
    const login = deferred<Response>();
    const fetch = vi.fn((url: string, init: RequestInit) => {
      if (url.endsWith("/auth/telegram")) return login.promise;
      const authorized = (init.headers as Record<string, string>).Authorization === "Bearer fresh";
      return Promise.resolve(response({ ok: true }, authorized ? 200 : 401));
    });
    vi.stubGlobal("fetch", fetch);
    const requests = Promise.all([api.get("/matches"), api.get("/me")]);
    await vi.waitFor(() => expect(fetch.mock.calls.filter(([url]) => url.endsWith("/auth/telegram"))).toHaveLength(1));
    login.resolve(response(fresh));
    expect((await requests).map((r) => r.status)).toEqual([200, 200]);
    expect(fetch).toHaveBeenCalledTimes(5);
    expect(getToken()).toBe("fresh");
  });

  it("запоздавший 401 повторяется с уже обновлённым токеном", async () => {
    const late = deferred<Response>();
    let firstMe = true;
    const fetch = vi.fn((url: string, init: RequestInit) => {
      if (url.endsWith("/auth/telegram")) return Promise.resolve(response(fresh));
      if (url.endsWith("/me") && firstMe) { firstMe = false; return late.promise; }
      const authorized = (init.headers as Record<string, string>).Authorization === "Bearer fresh";
      return Promise.resolve(response({}, authorized ? 200 : 401));
    });
    vi.stubGlobal("fetch", fetch);
    const pending = api.get("/me");
    await api.get("/matches");
    late.resolve(response({}, 401));
    expect((await pending).status).toBe(200);
    expect(fetch.mock.calls.filter(([url]) => url.endsWith("/auth/telegram"))).toHaveLength(1);
  });

  it("повторный отказ после обновления завершает сессию", async () => {
    vi.stubGlobal("fetch", vi.fn((url: string) => Promise.resolve(
      url.endsWith("/auth/telegram") ? response(fresh) : response({}, 401),
    )));
    await expect(api.get("/matches")).rejects.toMatchObject({ response: { status: 401 } });
    expect(useSession.getState().authenticated).toBe(false);
    expect(location.hash).toBe("#/onboarding");
  });

  it("выход во время обновления не восстанавливает старый аккаунт", async () => {
    const login = deferred<Response>();
    const fetch = vi.fn((url: string) => url.endsWith("/auth/telegram")
      ? login.promise : Promise.resolve(response({}, 401)));
    vi.stubGlobal("fetch", fetch);
    const request = api.get("/matches").catch((e) => e);
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    useSession.getState().logout();
    login.resolve(response(fresh));
    expect((await request).message).toContain("Сессия изменилась");
    expect(getToken()).toBeNull();
    expect(useSession.getState().authenticated).toBe(false);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it.each([200, 401])("поздний ответ %i старого аккаунта не меняет новую сессию", async (status) => {
    const late = deferred<Response>();
    const fetch = vi.fn(() => late.promise);
    vi.stubGlobal("fetch", fetch);
    const request = api.get("/me").catch((e) => e);
    useSession.getState().setAuth("new-account", "employer", "e2");
    late.resolve(response({ name: "Старый аккаунт" }, status));
    expect((await request).message).toContain("Сессия изменилась");
    expect(getToken()).toBe("new-account");
    expect(useSession.getState().userId).toBe("e2");
    expect(location.hash).toBe("#/matches");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("недоступность сервера авторизации сохраняет вход для следующей попытки", async () => {
    vi.stubGlobal("fetch", vi.fn((url: string) => Promise.resolve(
      response({}, url.endsWith("/auth/telegram") ? 503 : 401),
    )));
    await expect(api.get("/matches")).rejects.toMatchObject({ response: { status: 503 } });
    expect(getToken()).toBe("expired");
    expect(useSession.getState().authenticated).toBe(true);
  });

  it("обычный отказ входа не запускает скрытую повторную авторизацию", async () => {
    const fetch = vi.fn(() => Promise.resolve(response({}, 401)));
    vi.stubGlobal("fetch", fetch);
    await expect(api.post("/auth/telegram", {})).rejects.toMatchObject({ response: { status: 401 } });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("обновление с другой личностью требует обычного входа", async () => {
    vi.stubGlobal("fetch", vi.fn((url: string) => Promise.resolve(url.endsWith("/auth/telegram")
      ? response({ ...fresh, user_id: "someone-else" }) : response({}, 401))));
    await expect(api.get("/me")).rejects.toMatchObject({ response: { status: 401 } });
    expect(useSession.getState().authenticated).toBe(false);
    expect(getToken()).toBeNull();
  });
});

describe("личные данные между сессиями", () => {
  it("выход очищает профили, чаты и результаты действий", () => {
    queryClient.setQueryData(["me"], { name: "Старый аккаунт" });
    queryClient.setQueryData(["messages", "m1"], [{ text: "Личная переписка" }]);
    queryClient.getMutationCache().build(queryClient, {});
    useSession.getState().logout();
    expect(queryClient.getQueryCache().getAll()).toEqual([]);
    expect(queryClient.getMutationCache().getAll()).toEqual([]);
  });

  it("вход другой ролью очищает старые данные", () => {
    queryClient.setQueryData(["me"], { name: "Работник" });
    useSession.getState().setAuth("venue-token", "employer", "e1");
    expect(queryClient.getQueryData(["me"])).toBeUndefined();
  });
});
