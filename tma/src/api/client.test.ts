// @vitest-environment jsdom
/**
 * Сетевой слой: раньше это был axios, теперь свои сто строк на fetch.
 *
 * Тесты здесь не про красоту кода, а про то, на что опирается всё
 * приложение: заголовок с токеном, параметры в адресе, переименование полей
 * из snake_case, нетронутые подписанные поля загрузки и — главное — форма
 * ошибки. Разбор ошибок (`e.response.status`, `e.response.data.detail`)
 * читают полтора десятка экранов; сломай её молча, и вместо «слишком часто»
 * человек увидит «что-то пошло не так» везде.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, setToken, ApiError } from "./client";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

let calls: { url: string; init: RequestInit }[] = [];

beforeEach(() => {
  calls = [];
  setToken(null);
});

afterEach(() => {
  vi.restoreAllMocks();
});

function mockFetch(fn: (url: string, init: RequestInit) => Response) {
  vi.stubGlobal("fetch", (url: string, init: RequestInit = {}) => {
    calls.push({ url, init });
    return Promise.resolve(fn(url, init));
  });
}

describe("запросы", () => {
  it("переименовывает поля ответа в camelCase", async () => {
    mockFetch(() => jsonResponse({ access_token: "t", user_id: "u1" }));
    const { data } = await api.get<{ accessToken: string; userId: string }>("/me");
    expect(data).toEqual({ accessToken: "t", userId: "u1" });
  });

  it("не трогает ответ, помеченный raw", async () => {
    // Подписанные поля формы загрузки: любое переименование ломает подпись,
    // и хранилище отказывается принять файл.
    mockFetch(() => jsonResponse({ fields: { "x-amz-signature": "abc" } }));
    const { data } = await api.get<{ fields: Record<string, string> }>(
      "/uploads/photo",
      { raw: true },
    );
    expect(data.fields["x-amz-signature"]).toBe("abc");
  });

  it("подставляет токен в заголовок", async () => {
    setToken("secret-token");
    mockFetch(() => jsonResponse({}));
    await api.get("/matches");
    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer secret-token");
  });

  it("складывает параметры в адрес и пропускает пустые", async () => {
    mockFetch(() => jsonResponse([]));
    await api.get("/vacancies", {
      params: { city: "Казань", min_rate: 400, role: undefined, sort: "" },
    });
    const url = calls[0].url;
    expect(url).toContain("city=%D0%9A%D0%B0%D0%B7%D0%B0%D0%BD%D1%8C");
    expect(url).toContain("min_rate=400");
    expect(url).not.toContain("role=");
    expect(url).not.toContain("sort=");
  });

  it("отправляет тело как JSON", async () => {
    mockFetch(() => jsonResponse({ ok: true }));
    await api.post("/swipes", { target_id: "v1", direction: "like" });
    expect(calls[0].init.method).toBe("POST");
    expect(JSON.parse(String(calls[0].init.body))).toEqual({
      target_id: "v1",
      direction: "like",
    });
  });

  it("понимает пустой ответ 204", async () => {
    mockFetch(() => new Response(null, { status: 204 }));
    const { data } = await api.delete("/vacancies/v1");
    expect(data).toBeNull();
  });
});

describe("ошибки", () => {
  it("отдаёт статус и тело — на них опирается разбор ошибок", async () => {
    mockFetch(() => jsonResponse({ detail: "Слишком часто" }, 429));
    const err = await api.get("/vacancies").catch((e) => e as ApiError);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).response?.status).toBe(429);
    expect((err as ApiError).response?.data).toEqual({ detail: "Слишком часто" });
  });

  it("конфликт смен доходит целиком, объектом", async () => {
    mockFetch(() =>
      jsonResponse(
        { detail: { code: "shift_conflict", message: "Смены пересекаются" } },
        409,
      ),
    );
    const err = (await api
      .post("/matches/m1/confirm", {})
      .catch((e) => e)) as ApiError;
    const detail = (err.response?.data as { detail: { code: string } }).detail;
    expect(err.response?.status).toBe(409);
    expect(detail.code).toBe("shift_conflict");
  });

  it("протухший токен уводит на вход, а не оставляет пустой экран", async () => {
    // Тихий вход по подписи Telegram снаружи мессенджера невозможен —
    // проверяем именно запасной путь: чистим токен и отправляем на онбординг.
    localStorage.setItem("ss_role", "seeker");
    setToken("stale");
    mockFetch(() => jsonResponse({ detail: "Токен недействителен" }, 401));
    await api.get("/matches").catch(() => undefined);
    expect(localStorage.getItem("ss_jwt")).toBeNull();
    expect(localStorage.getItem("ss_role")).toBeNull();
    expect(location.hash).toBe("#/onboarding");
  });

  it("нет связи — ошибка без ответа, а не молчаливое зависание", async () => {
    vi.stubGlobal("fetch", () => Promise.reject(new Error("network down")));
    const err = (await api.get("/matches").catch((e) => e)) as ApiError;
    expect(err).toBeInstanceOf(ApiError);
    expect(err.response).toBeUndefined();
  });
});
