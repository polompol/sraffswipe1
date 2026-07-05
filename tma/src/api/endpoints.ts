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
  date_to?: string;
  rate_type?: string;
  no_med_book?: boolean;
  no_experience?: boolean;
  verified_only?: boolean;
  tips_only?: boolean;
  sort?: string;
  radius_km?: number;
  lat?: number;
  lng?: number;
  // Фильтры ленты кандидатов (сторона заведения).
  district?: string;
  available_today?: boolean;
  reliable_only?: boolean;
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
  const { data } = await api.get<Seeker[]>("/candidates", { params: filters });
  return data;
}

/** «Кто меня зовёт»: смены заведений, которые лайкнули соискателя (мэтча нет). */
export async function fetchInvites(): Promise<Vacancy[]> {
  if (!USE_BACKEND) return mock.fetchInvites();
  const { data } = await api.get<Vacancy[]>("/vacancies/invites");
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

/** Работодатель отмечает после смены: работник вышел или нет (надёжность). */
export async function markAttendance(
  matchId: string,
  attended: boolean,
): Promise<void> {
  if (!USE_BACKEND) return mock.markAttendance(matchId, attended);
  await api.post(`/matches/${matchId}/attendance`, { attended });
}

/** Сторона работника во взаимном подтверждении: «я на смене» (код ИЛИ гео). */
export async function checkinShift(
  matchId: string,
  body: { code?: string; lat?: number; lng?: number },
): Promise<MatchModel> {
  if (!USE_BACKEND) return mock.checkinShift(matchId, body);
  const { data } = await api.post<MatchModel>(
    `/matches/${matchId}/checkin`,
    body,
  );
  return data;
}

/** Спор по смене («был/пришёл, но не могу подтвердить») → к оператору. */
export async function disputeShift(
  matchId: string,
  note = "",
): Promise<MatchModel> {
  if (!USE_BACKEND) return mock.disputeShift(matchId, note);
  const { data } = await api.post<MatchModel>(
    `/matches/${matchId}/dispute`,
    { note },
  );
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
  incomingLikes?: number;
  earnedRub?: number;
  shiftsDone?: number;
  availableToday?: boolean;
  profileCompletion?: number;
}

export async function fetchMe(): Promise<Me> {
  if (!USE_BACKEND) return mock.fetchMe();
  const { data } = await api.get<Me>("/me");
  return data;
}

/** «Готов выйти сегодня» — тумблер доступности соискателя. */
export async function setAvailability(available: boolean): Promise<boolean> {
  if (!USE_BACKEND) return mock.setAvailability(available);
  const { data } = await api.post<{ availableToday: boolean }>("/me/available", {
    available,
  });
  return data.availableToday;
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

/** «Срочно»: пинг доступным соискателям в городе смены. Возвращает число. */
export async function urgentPing(vacancyId: string): Promise<number> {
  if (!USE_BACKEND) return mock.urgentPing(vacancyId);
  const { data } = await api.post<{ pinged: number }>(`/vacancies/${vacancyId}/urgent`, {});
  return data.pinged;
}

export interface Worker {
  id: string;
  name: string;
  rating: number;
  availableToday: boolean;
  shiftsTotal: number;
  shiftsAttended: number;
}

/** Работники, уже выходившие на смены заведения — чтобы позвать снова. */
export async function fetchMyWorkers(): Promise<Worker[]> {
  if (!USE_BACKEND) return mock.fetchMyWorkers();
  const { data } = await api.get<
    { id: string; name: string; rating: number; available_today: boolean; shifts_total: number; shifts_attended: number }[]
  >("/employer/workers");
  return data.map((w) => ({
    id: w.id, name: w.name, rating: w.rating, availableToday: w.available_today,
    shiftsTotal: w.shifts_total, shiftsAttended: w.shifts_attended,
  }));
}

export async function inviteWorker(userId: string): Promise<void> {
  if (!USE_BACKEND) return mock.inviteWorker(userId);
  await api.post(`/employer/invite/${userId}`, {});
}

export interface VacancyInput {
  role: string;
  date: string;
  start_time: number;
  end_time: number;
  rate: number;
  rate_type: string;
  pay_method?: string;
  tips?: string;
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

// --- Живая лента активности (социальное доказательство, FOMO) ---

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

export interface AdminRevenue {
  activePro: number;
  activeBusiness: number;
  estMonthlyRub: number;
  totalPaidRub: number;
  totalStars: number;
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
  if (!USE_BACKEND) return mock.fetchAdminReports(status);
  const { data } = await api.get<AdminReport[]>("/admin/reports", {
    params: { status },
  });
  return data;
}

export async function fetchRevenue(): Promise<AdminRevenue> {
  if (!USE_BACKEND) return mock.fetchRevenue();
  const { data } = await api.get<AdminRevenue>("/admin/revenue");
  return data;
}

export async function resolveReport(id: string, reply = ""): Promise<void> {
  if (!USE_BACKEND) return mock.resolveReport(id);
  await api.post(`/admin/reports/${id}/resolve`, { reply });
}

/** Предупредить нарушителя (+1 предупреждение, уведомление ему). */
export async function warnReport(id: string, note = ""): Promise<number> {
  if (!USE_BACKEND) return mock.warnReport(id);
  const { data } = await api.post<{ warnings: number }>(
    `/admin/reports/${id}/warn`,
    { note },
  );
  return data.warnings;
}

export interface AdminUser {
  id: string;
  role: "seeker" | "employer";
  name: string;
  username?: string | null;
  blocked: boolean;
  warnings: number;
  plan: string;
  boostBalance: number;
  superlikeBalance: number;
}

/** Поиск людей/заведений в админке (по имени, @нику, телефону). */
export async function adminSearchUsers(q: string): Promise<AdminUser[]> {
  if (!USE_BACKEND) return mock.adminSearchUsers(q);
  const { data } = await api.get<AdminUser[]>("/admin/users", { params: { q } });
  return data;
}

/** Бесплатно выдать буст/подписку/супер-лайки (комп, поддержка). */
export async function adminGrant(ownerId: string, sku: string): Promise<void> {
  if (!USE_BACKEND) return mock.adminGrant(ownerId, sku);
  await api.post("/admin/grant", { owner_id: ownerId, sku });
}

export interface CommissionRow {
  employerId: string;
  company: string;
  shifts: number;
  amountRub: number;
}

/** Комиссия к счёту по заведениям (закрытые смены, ещё не оплачено). */
export async function fetchCommissions(): Promise<CommissionRow[]> {
  if (!USE_BACKEND) return mock.fetchCommissions();
  const { data } = await api.get<CommissionRow[]>("/admin/commissions");
  return data;
}

/** Отметить комиссию заведения оплаченной (после оплаты по счёту). */
export async function settleCommission(employerId: string): Promise<void> {
  if (!USE_BACKEND) return mock.settleCommission(employerId);
  await api.post(`/admin/commissions/${employerId}/settle`, {});
}

export interface SourceRow {
  source: string;
  seekers: number;
  employers: number;
}

/** Источники регистраций: ссылки t.me/<bot>?startapp=src_<канал>. */
export async function fetchSources(): Promise<SourceRow[]> {
  if (!USE_BACKEND) return mock.fetchSources();
  const { data } = await api.get<SourceRow[]>("/admin/sources");
  return data;
}

export interface CommissionInfo {
  pendingRub: number;
  pendingShifts: number;
  overdue: boolean;
  dueDays: number;
  pct: number;
}

/** Мой счёт по комиссии (для заведения): сколько накопилось и не просрочен ли. */
export async function fetchMyCommission(): Promise<CommissionInfo> {
  if (!USE_BACKEND) return mock.fetchMyCommission();
  const { data } = await api.get<CommissionInfo>("/billing/commission");
  return data;
}

/** Оператор закрывает спор по смене: засчитать или зафиксировать неявку. */
export async function resolveMatch(
  matchId: string,
  outcome: "completed" | "no_show",
): Promise<void> {
  if (!USE_BACKEND) return mock.resolveMatch(matchId, outcome);
  await api.post(`/matches/${matchId}/resolve`, { outcome });
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

// --- Избранные смены ---

export async function listFavoriteIds(): Promise<string[]> {
  if (!USE_BACKEND) return mock.listFavoriteIds();
  const { data } = await api.get<string[]>("/favorites/ids");
  return data;
}

export async function listFavorites(): Promise<Vacancy[]> {
  if (!USE_BACKEND) return mock.listFavorites();
  const { data } = await api.get<Vacancy[]>("/favorites");
  return data;
}

export async function addFavorite(vacancyId: string): Promise<void> {
  if (!USE_BACKEND) return mock.addFavorite(vacancyId);
  await api.post(`/favorites/${vacancyId}`, {});
}

export async function removeFavorite(vacancyId: string): Promise<void> {
  if (!USE_BACKEND) return mock.removeFavorite(vacancyId);
  await api.delete(`/favorites/${vacancyId}`);
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

/** Запрос ссылки на оплату ЮKassa (рубли). email — для фискального чека (54-ФЗ). */
export async function createYookassaPayment(
  sku: string,
  email?: string,
): Promise<PaymentUrl> {
  if (!USE_BACKEND) return { url: `https://example.com/pay/${sku}` };
  const { data } = await api.post<PaymentUrl>("/billing/yookassa/payment", {
    sku,
    email: email || null,
  });
  return data;
}
