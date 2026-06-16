import { api } from "./client";
import * as mock from "./mock";
import type {
  AppRole,
  Entitlements,
  MatchModel,
  Message,
  Seeker,
  SwipeDirection,
  Vacancy,
} from "@/types/domain";

// Если backend недоступен/не настроен — работаем на mock-данных, чтобы
// демо в Telegram открывалось без сервера. Управляется VITE_USE_BACKEND.
const USE_BACKEND = import.meta.env.VITE_USE_BACKEND === "true";

export interface AuthResult {
  accessToken: string;
  role: AppRole;
  userId: string;
}

export async function authTelegram(
  initData: string,
  role: AppRole,
): Promise<AuthResult> {
  if (!USE_BACKEND) return mock.authTelegram(role);
  const { data } = await api.post("/auth/telegram", { init_data: initData, role });
  return { accessToken: data.accessToken, role: data.role, userId: data.userId };
}

export async function fetchFeed(role: AppRole): Promise<Vacancy[] | Seeker[]> {
  if (!USE_BACKEND) return mock.fetchFeed(role);
  if (role === "seeker") {
    const { data } = await api.get<Vacancy[]>("/vacancies");
    return data;
  }
  const { data } = await api.get<Seeker[]>("/candidates");
  return data;
}

export interface SwipeResult {
  matched: boolean;
  matchId?: string;
}

export async function sendSwipe(
  targetId: string,
  targetType: "vacancy" | "user",
  direction: SwipeDirection,
): Promise<SwipeResult> {
  if (!USE_BACKEND) return mock.sendSwipe(targetId, direction);
  const { data } = await api.post("/swipes", {
    target_id: targetId,
    target_type: targetType,
    direction,
  });
  return { matched: Boolean(data.matched), matchId: data.matchId ?? undefined };
}

export async function fetchMatches(): Promise<MatchModel[]> {
  if (!USE_BACKEND) return mock.fetchMatches();
  const { data } = await api.get<MatchModel[]>("/matches");
  return data;
}

export async function fetchMessages(matchId: string): Promise<Message[]> {
  if (!USE_BACKEND) return mock.fetchMessages(matchId);
  const { data } = await api.get<Message[]>(`/matches/${matchId}/messages`);
  return data;
}

export async function sendMessage(
  matchId: string,
  text: string,
): Promise<Message> {
  if (!USE_BACKEND) return mock.sendMessage(matchId, text);
  const { data } = await api.post<Message>(`/matches/${matchId}/messages`, {
    text,
  });
  return data;
}

export async function confirmShift(matchId: string): Promise<MatchModel> {
  if (!USE_BACKEND) return mock.confirmShift(matchId);
  const { data } = await api.post<MatchModel>(`/matches/${matchId}/confirm`, {});
  return data;
}

export async function fetchEntitlements(): Promise<Entitlements> {
  if (!USE_BACKEND) return mock.fetchEntitlements();
  const { data } = await api.get<Entitlements>("/billing/entitlements");
  return data;
}

export interface InvoiceLink {
  link: string;
}

/** Запрос ссылки на оплату Stars (XTR) с backend. */
export async function createStarsInvoice(sku: string): Promise<InvoiceLink> {
  if (!USE_BACKEND) return { link: `mock-invoice:${sku}` };
  const { data } = await api.post<InvoiceLink>("/billing/stars/invoice", { sku });
  return data;
}

export interface Me {
  id: string;
  role: AppRole;
  name: string;
  rating: number;
  tgUsername?: string | null;
}

export async function fetchMe(): Promise<Me> {
  if (!USE_BACKEND) return mock.fetchMe();
  const { data } = await api.get<Me>("/me");
  return data;
}

export interface ReferralInfo {
  code: string;
  link: string;
  invited: number;
  bonusSuperlikes: number;
}

export async function fetchReferral(): Promise<ReferralInfo> {
  if (!USE_BACKEND) return mock.fetchReferral();
  const { data } = await api.get<ReferralInfo>("/referral/me");
  return data;
}

export async function leaveReview(
  matchId: string,
  stars: number,
  text: string,
): Promise<void> {
  if (!USE_BACKEND) return mock.leaveReview();
  await api.post(`/matches/${matchId}/review`, { stars, text });
}

export async function boostVacancy(vacancyId: string): Promise<void> {
  if (!USE_BACKEND) return mock.boostVacancy(vacancyId);
  await api.post(`/vacancies/${vacancyId}/boost`, {});
}

/** Аналитика воронки. Никогда не бросает — это «fire and forget». */
export function track(name: string, props?: Record<string, unknown>): void {
  if (!USE_BACKEND) return;
  api.post("/events", { name, props }).catch(() => {});
}

export interface AddressSuggestion {
  value: string;
  lat?: number | null;
  lng?: number | null;
}

export async function suggestAddress(q: string): Promise<AddressSuggestion[]> {
  if (!USE_BACKEND) return mock.suggestAddress(q);
  const { data } = await api.get<AddressSuggestion[]>("/dadata/address", {
    params: { q },
  });
  return data;
}

export interface PaymentUrl {
  url: string;
}

/** Запрос ссылки на оплату ЮKassa (рубли) с backend. */
export async function createYookassaPayment(sku: string): Promise<PaymentUrl> {
  if (!USE_BACKEND) return { url: `https://example.com/pay/${sku}` };
  const { data } = await api.post<PaymentUrl>("/billing/yookassa/payment", {
    sku,
  });
  return data;
}
