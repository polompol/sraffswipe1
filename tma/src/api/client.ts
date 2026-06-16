import axios from "axios";

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

api.interceptors.response.use((response) => {
  response.data = toCamel(response.data);
  return response;
});

export { baseURL };
