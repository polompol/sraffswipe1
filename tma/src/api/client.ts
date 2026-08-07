import axios from "axios";
import { reportError } from "@/lib/report";

const baseURL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

let token: string | null = localStorage.getItem("ss_jwt");

export function setToken(value: string | null): void {
  token = value;
  if (value) localStorage.setItem("ss_jwt", value);
  else localStorage.removeItem("ss_jwt");
}

export function getToken(): string | null {
  return token;
}

export const api = axios.create({ baseURL, timeout: 15000 });

api.interceptors.request.use((config) => {
  if (token) {
    config.headers = config.headers ?? {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

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

/**
 * Тихий повторный вход по подписи Telegram. Возвращает новый токен или null.
 *
 * Запрос идёт «голым» axios, а не через `api`: иначе его собственная ошибка
 * попала бы в этот же перехватчик и мы ушли бы в рекурсию.
 */
async function silentReauth(): Promise<string | null> {
  const role = localStorage.getItem("ss_role");
  if (!role) return null;
  try {
    const { retrieveRawInitData } = await import("@telegram-apps/sdk-react");
    const initData = retrieveRawInitData() ?? "";
    if (!initData) return null;
    const { data } = await axios.post(
      `${baseURL}/auth/telegram`,
      { init_data: initData, role },
      { timeout: 15000 },
    );
    const fresh = data?.access_token ?? data?.accessToken ?? null;
    if (!fresh) return null;
    setToken(fresh);
    return fresh;
  } catch {
    return null;
  }
}

api.interceptors.response.use(
  (response) => {
    response.data = toCamel(response.data);
    return response;
  },
  async (error) => {
    const status = error?.response?.status;
    // 5xx и сетевые ошибки — в репорт (4xx ожидаемы: лимиты, валидация).
    if (!status || status >= 500) {
      reportError(error, `http ${error?.config?.url ?? ""}`);
    }
    // Истёк или отозван токен. В Telegram вход не требует действий человека:
    // подпись приходит вместе с запуском приложения. Поэтому сначала молча
    // пробуем войти заново и повторить запрос — человек ничего не заметит.
    // Только если и это не вышло, уводим на онбординг.
    if (status === 401 && !error.config?._retried) {
      const cfg = error.config ?? {};
      cfg._retried = true; // одна попытка, иначе зациклимся на битом токене
      const restored = await silentReauth();
      if (restored) {
        cfg.headers = { ...(cfg.headers ?? {}), Authorization: `Bearer ${restored}` };
        return api.request(cfg);
      }
      setToken(null);
      localStorage.removeItem("ss_role");
      localStorage.removeItem("ss_uid");
      if (!location.hash.startsWith("#/onboarding")) {
        location.hash = "#/onboarding";
      }
    }
    return Promise.reject(error);
  },
);

export const wsBaseURL = baseURL.replace(/^http/, "ws");
export const useBackend = import.meta.env.VITE_USE_BACKEND === "true";

export { baseURL };
