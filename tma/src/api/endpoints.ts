import axios from "axios";
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

export interface FeedFilters {
  role?: string;
  city?: string;
  min_rate?: number;
  date_from?: string;
  rate_type?: string;
  no_med_book?: boolean;
  no_experience?: boolean;
  verified_only?: boolean;
  sort?: string;
}

export async function fetchFeed(
  role: AppRole,
  filters?: FeedFilters,
): Promise<Vacancy[] | Seeker[]> {
  if (!USE_BACKEND) return mock.fetchFeed(role, filters);
  if (role === "seeker") {
    const { data } = await api.get<Vacancy[]>("/vacancies", { params: filters });
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
  streak?: number;
  city?: string;
}

export async function fetchMe(): Promise<Me> {
  if (!USE_BACKEND) return mock.fetchMe();
  const { data } = await api.get<Me>("/me");
  return data;
}

export interface MeUpdate {
  name?: string;
  birth_date?: string;
  city?: string;
  district?: string;
  roles?: string[];
  med_book?: string;
  self_employed?: boolean;
  inn?: string;
  about?: string;
  photo_url?: string;
  company_name?: string;
}

/** Обновление профиля. Бросает при ошибке (напр. 422 для <18 лет). */
export async function updateMe(patch: MeUpdate): Promise<Me> {
  if (!USE_BACKEND) return mock.updateMe(patch);
  const { data } = await api.put<Me>("/me", patch);
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

export interface VacancyInput {
  role: string;
  date: string;
  start_time: number;
  end_time: number;
  rate: number;
  rate_type: string;
  description?: string;
  require_med_book?: boolean;
  address?: string;
  city?: string;
  lat?: number;
  lng?: number;
}

/** Публикация вакансии работодателем. */
export async function createVacancy(input: VacancyInput): Promise<Vacancy> {
  if (!USE_BACKEND) return mock.createVacancy(input);
  const { data } = await api.post<Vacancy>("/vacancies", input);
  return data;
}

/** Собственные вакансии работодателя (любой статус). */
export async function fetchMyVacancies(): Promise<Vacancy[]> {
  if (!USE_BACKEND) return mock.fetchMyVacancies();
  const { data } = await api.get<Vacancy[]>("/vacancies", {
    params: { mine: 1 },
  });
  return data;
}

export type ReportTargetType = "vacancy" | "user" | "match";
export type ReportReason = "spam" | "fake" | "scam" | "abuse" | "other";

/** Жалоба на вакансию/пользователя/мэтч (доверие и безопасность). */
export async function reportTarget(
  targetType: ReportTargetType,
  targetId: string,
  reason: ReportReason,
  text = "",
): Promise<void> {
  if (!USE_BACKEND) return mock.reportTarget();
  await api.post("/reports", {
    target_type: targetType,
    target_id: targetId,
    reason,
    text,
  });
}

/** Аналитика воронки. Никогда не бросает — это «fire and forget». */
export function track(name: string, props?: Record<string, unknown>): void {
  if (!USE_BACKEND) return;
  api.post("/events", { name, props }).catch(() => {});
}

export type Funnel = Record<string, number>;

export async function fetchFunnel(): Promise<Funnel> {
  if (!USE_BACKEND) {
    return { open: 1200, swipe: 940, match: 410, confirm: 180, purchase: 64 };
  }
  const { data } = await api.get<{ counts: Funnel }>("/analytics/funnel");
  return data.counts;
}

// --- Админ-панель (контроль жалоб, подписок, метрик) ---

export interface AdminOverview {
  users: number;
  activeVacancies: number;
  likes: number;
  matches: number;
  openReports: number;
  activeSubscriptions: number;
}

export interface AdminReport {
  id: string;
  targetType: string;
  targetId: string;
  targetInfo: string;
  reason: string;
  text: string;
  status: string;
  createdAt: string;
}

export interface AdminBlocked {
  type: string;
  id: string;
  info: string;
}

export interface AdminSubscription {
  ownerId: string;
  company: string;
  plan: string;
  renewsAt?: string | null;
}

export async function fetchAdminOverview(): Promise<AdminOverview> {
  if (!USE_BACKEND) return mock.fetchAdminOverview();
  const { data } = await api.get<AdminOverview>("/admin/overview");
  return data;
}

export async function fetchAdminReports(status = "open"): Promise<AdminReport[]> {
  if (!USE_BACKEND) return mock.fetchAdminReports();
  const { data } = await api.get<AdminReport[]>("/admin/reports", {
    params: { status },
  });
  return data;
}

export async function resolveReport(id: string): Promise<void> {
  if (!USE_BACKEND) return mock.resolveReport(id);
  await api.post(`/admin/reports/${id}/resolve`, {});
}

/** Заблокировать пользователя (соискателя/работодателя). */
export async function blockUser(userId: string): Promise<void> {
  if (!USE_BACKEND) return mock.resolveReport("");
  await api.post(`/admin/users/${userId}/block`, {});
}

/** Снять вакансию (фейк/обман) с публикации. */
export async function blockVacancy(vacancyId: string): Promise<void> {
  if (!USE_BACKEND) return mock.resolveReport("");
  await api.post(`/admin/vacancies/${vacancyId}/block`, {});
}

export async function unblockUser(userId: string): Promise<void> {
  if (!USE_BACKEND) return mock.resolveReport("");
  await api.post(`/admin/users/${userId}/unblock`, {});
}

export async function unblockVacancy(vacancyId: string): Promise<void> {
  if (!USE_BACKEND) return mock.resolveReport("");
  await api.post(`/admin/vacancies/${vacancyId}/unblock`, {});
}

export async function fetchBlocked(): Promise<AdminBlocked[]> {
  if (!USE_BACKEND) return mock.fetchBlocked();
  const { data } = await api.get<AdminBlocked[]>("/admin/blocked");
  return data;
}

/** Отозвать подписку (после возврата денег) — доступ падает на Free. */
export async function cancelSubscription(ownerId: string): Promise<void> {
  if (!USE_BACKEND) return mock.cancelSubscription(ownerId);
  await api.post(`/admin/subscriptions/${ownerId}/cancel`, {});
}

export async function fetchAdminSubscriptions(): Promise<AdminSubscription[]> {
  if (!USE_BACKEND) return mock.fetchAdminSubscriptions();
  const { data } = await api.get<AdminSubscription[]>("/admin/subscriptions");
  return data;
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

export interface SavedSearch {
  id: string;
  title: string;
  filters: FeedFilters;
  notify: boolean;
}

export async function listSavedSearches(): Promise<SavedSearch[]> {
  if (!USE_BACKEND) return mock.listSavedSearches();
  const { data } = await api.get<SavedSearch[]>("/saved-searches");
  return data;
}

export async function createSavedSearch(
  title: string,
  filters: FeedFilters,
  notify: boolean,
): Promise<SavedSearch> {
  if (!USE_BACKEND) return mock.createSavedSearch(title, filters, notify);
  const { data } = await api.post<SavedSearch>("/saved-searches", {
    title,
    filters,
    notify,
  });
  return data;
}

export async function deleteSavedSearch(id: string): Promise<void> {
  if (!USE_BACKEND) return mock.deleteSavedSearch(id);
  await api.delete(`/saved-searches/${id}`);
}

export interface VerifyResult {
  found: boolean;
  verified: boolean;
  name: string;
  ogrn: string;
  address: string;
  hint: string;
}

export async function verifyEmployer(inn: string): Promise<VerifyResult> {
  if (!USE_BACKEND) return mock.verifyEmployer(inn);
  const { data } = await api.post<VerifyResult>("/employer/verify", { inn });
  return data;
}

/** Загрузка фото: presigned URL → прямой PUT в S3 → публичный URL. */
export async function uploadPhoto(file: File): Promise<string> {
  if (!USE_BACKEND) {
    throw new Error("Загрузка фото доступна только с backend");
  }
  const { data } = await api.post<{ upload_url: string; public_url: string }>(
    "/uploads/photo-url",
    { content_type: file.type },
  );
  // Прямой PUT в S3 — без наших интерсепторов/JWT.
  await axios.put(data.upload_url, file, {
    headers: { "Content-Type": file.type },
  });
  return data.public_url;
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
