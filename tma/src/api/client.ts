import { reportError } from "@/lib/report";
import { LS } from "@/lib/storage";

/**
 * Сетевой слой приложения.
 *
 * Раньше здесь работал axios. Он удобен, но весит 137 КБ — четверть всего,
 * что телефон скачивает при первом открытии, и это на мобильном интернете в
 * зале ресторана. Всё, чем мы пользовались (заголовок с токеном, таймаут,
 * разбор ошибок, повтор после тихого входа), браузер умеет сам через fetch.
 * Поэтому axios заменён этой сотней строк — снаружи вызовы остались теми же:
 * `api.get(...)`, `api.post(...)`, `{ data }` в ответе и `e.response.status`
 * в ошибке.
 */

const baseURL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

/** Сколько ждём ответ. Дальше честнее сказать «нет связи», чем висеть. */
const TIMEOUT_MS = 15000;

export interface RequestConfig {
  params?: object;
  headers?: Record<string, string>;
  /** Ответ, который НЕЛЬЗЯ переименовывать: подписанные поля формы загрузки —
   *  там любое переименование ломает подпись, и файл не примут. */
  raw?: boolean;
  timeout?: number;
  /** Служебное: запрос уже повторяли после тихого входа. */
  retried?: boolean;
}

export interface ApiResponse<T> {
  data: T;
  status: number;
}

/**
 * Ошибка запроса. Форма `response.status` / `response.data` намеренно
 * повторяет axios: на неё опирается весь разбор ошибок в приложении
 * (см. lib/errors.ts) и проверки вроде «409 — пересечение смен».
 */
export class ApiError extends Error {
  response?: { status: number; data: unknown };
  config: RequestConfig & { url: string; method: string };

  constructor(
    message: string,
    config: RequestConfig & { url: string; method: string },
    response?: { status: number; data: unknown },
  ) {
    super(message);
    this.name = "ApiError";
    this.config = config;
    this.response = response;
  }
}

let token: string | null = localStorage.getItem(LS.jwt);

export function setToken(value: string | null): void {
  token = value;
  if (value) localStorage.setItem(LS.jwt, value);
  else localStorage.removeItem(LS.jwt);
}

export function getToken(): string | null {
  return token;
}

// Backend отдаёт snake_case — нормализуем в camelCase для фронта.
function toCamel(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(toCamel);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      const ck = k.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
      out[ck] = toCamel(v);
    }
    return out;
  }
  return value;
}

function withParams(url: string, params?: object): string {
  if (!params) return url;
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    // undefined и null — «параметр не задан», а не строка «undefined».
    if (v === undefined || v === null || v === "") continue;
    qs.append(k, String(v));
  }
  const q = qs.toString();
  return q ? `${url}${url.includes("?") ? "&" : "?"}${q}` : url;
}

async function parseBody(res: Response): Promise<unknown> {
  const type = res.headers.get("content-type") ?? "";
  if (res.status === 204) return null;
  if (type.includes("application/json")) {
    try {
      return await res.json();
    } catch {
      return null;
    }
  }
  const text = await res.text();
  return text || null;
}

/**
 * Тихий повторный вход по подписи Telegram. Возвращает новый токен или null.
 *
 * Идёт «голым» fetch, а не через `request`: иначе его собственная ошибка
 * снова привела бы сюда, и мы ушли бы в рекурсию.
 */
async function silentReauth(): Promise<string | null> {
  const role = localStorage.getItem(LS.role);
  if (!role) return null;
  try {
    const { retrieveRawInitData } = await import("@telegram-apps/sdk-react");
    const initData = retrieveRawInitData() ?? "";
    if (!initData) return null;
    const res = await fetch(`${baseURL}/auth/telegram`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ init_data: initData, role }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      access_token?: string;
      accessToken?: string;
    };
    const fresh = data?.access_token ?? data?.accessToken ?? null;
    if (!fresh) return null;
    setToken(fresh);
    return fresh;
  } catch {
    return null;
  }
}

async function request<T>(
  method: string,
  url: string,
  body?: unknown,
  config: RequestConfig = {},
): Promise<ApiResponse<T>> {
  const full = baseURL + withParams(url, config.params);
  const headers: Record<string, string> = { ...(config.headers ?? {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined && !(body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
  }

  let res: Response;
  try {
    res = await fetch(full, {
      method,
      headers,
      body:
        body === undefined
          ? undefined
          : body instanceof FormData
            ? body
            : JSON.stringify(body),
      signal: AbortSignal.timeout(config.timeout ?? TIMEOUT_MS),
    });
  } catch (e) {
    // Нет сети, таймаут, отказ соединения — ответа не будет вовсе.
    const err = new ApiError("Нет связи с сервером", { ...config, url, method });
    reportError(e, `http ${url}`);
    throw err;
  }

  const data = await parseBody(res);

  if (res.ok) {
    return { data: (config.raw ? data : toCamel(data)) as T, status: res.status };
  }

  // Истёк или отозван токен. В Telegram вход не требует действий человека:
  // подпись приходит вместе с запуском приложения. Поэтому сначала молча
  // пробуем войти заново и повторить запрос — человек ничего не заметит.
  // Только если и это не вышло, уводим на онбординг.
  if (res.status === 401 && !config.retried) {
    const restored = await silentReauth();
    if (restored) {
      return request<T>(method, url, body, { ...config, retried: true });
    }
    setToken(null);
    localStorage.removeItem(LS.role);
    localStorage.removeItem(LS.uid);
    if (!location.hash.startsWith("#/onboarding")) {
      location.hash = "#/onboarding";
    }
  }

  // 5xx — в репорт (4xx ожидаемы: лимиты, валидация, отказы по правилам).
  const err = new ApiError(`HTTP ${res.status}`, { ...config, url, method }, {
    status: res.status,
    data,
  });
  if (res.status >= 500) reportError(err, `http ${url}`);
  throw err;
}

export const api = {
  get: <T>(url: string, config?: RequestConfig) =>
    request<T>("GET", url, undefined, config),
  post: <T>(url: string, body?: unknown, config?: RequestConfig) =>
    request<T>("POST", url, body, config),
  put: <T>(url: string, body?: unknown, config?: RequestConfig) =>
    request<T>("PUT", url, body, config),
  patch: <T>(url: string, body?: unknown, config?: RequestConfig) =>
    request<T>("PATCH", url, body, config),
  delete: <T>(url: string, config?: RequestConfig) =>
    request<T>("DELETE", url, undefined, config),
};

/** Отправка файла прямо в хранилище — мимо нашего сервера и без токена. */
export async function postForm(url: string, form: FormData): Promise<void> {
  const res = await fetch(url, {
    method: "POST",
    body: form,
    signal: AbortSignal.timeout(60000), // фото по мобильному интернету
  });
  if (!res.ok) {
    throw new ApiError(
      `Хранилище отказалось принять файл (${res.status})`,
      { url, method: "POST" },
      { status: res.status, data: null },
    );
  }
}

export const wsBaseURL = baseURL.replace(/^http/, "ws");
export const useBackend = import.meta.env.VITE_USE_BACKEND === "true";

export { baseURL };
