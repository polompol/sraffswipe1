import axios from "axios";
import { api, baseURL, getToken } from "./client";
import * as mock from "./mock";
import type {
  AppRole,
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

/** Смена, которая пересекается по времени с подтверждаемой. */
export class ShiftConflict extends Error {
  constructor(public readonly detail: string) {
    super(detail);
    this.name = "ShiftConflict";
  }
}

/**
 * Подтвердить смену. `force` — согласие взять её, несмотря на пересечение с
 * другой сменой этого же человека: сервер предупреждает, но не запрещает.
 */
export async function confirmShift(
  matchId: string,
  force = false,
): Promise<MatchModel> {
  if (!USE_BACKEND) return mock.confirmShift(matchId);
  try {
    const { data } = await api.post<MatchModel>(
      `/matches/${matchId}/confirm`,
      {},
      { params: force ? { force: true } : undefined },
    );
    return data;
  } catch (e: any) {
    const d = e?.response?.data?.detail;
    if (e?.response?.status === 409 && d?.code === "shift_conflict") {
      throw new ShiftConflict(d.message);
    }
    throw e;
  }
}

/** Работодатель отмечает после смены: работник вышел или нет (надёжность). */
export async function markAttendance(
  matchId: string,
  attended: boolean,
): Promise<void> {
  if (!USE_BACKEND) return mock.markAttendance(matchId, attended);
  await api.post(`/matches/${matchId}/attendance`, { attended });
}

/** Отметка работника «я на смене» — только кодом заведения.
 *
 *  Геолокацию убрали: она просила разрешение на местоположение, не работала
 *  в подвалах и на кухнях и ничего не доказывала — рядом с кафе можно
 *  оказаться и не работая. Отметка больше не обязательна для закрытия смены:
 *  код нужен как доказательство в споре. */
export async function checkinShift(
  matchId: string,
  body: { code: string },
): Promise<MatchModel> {
  if (!USE_BACKEND) return mock.checkinShift(matchId, body);
  const { data } = await api.post<MatchModel>(
    `/matches/${matchId}/checkin`,
    body,
  );
  return data;
}

/**
 * «Смена не состоялась» — единственный способ не платить за договорённую смену.
 *
 * Раньше платить было не нужно по умолчанию: смена закрывалась только когда
 * обе стороны нажимали кнопку, и комиссия начислялась только при закрытии.
 * Значит, чтобы не платить 10%, заведению достаточно было ничего не нажимать
 * и не называть работнику код. Сторона, которая должна деньги, выигрывала от
 * бездействия. Теперь наоборот: договорились — смена считается состоявшейся,
 * пока кто-то явно не заявил обратное.
 */
export async function markNotHeld(
  matchId: string,
  reason = "",
): Promise<MatchModel> {
  if (!USE_BACKEND) return mock.markNotHeld(matchId, reason);
  const { data } = await api.post<MatchModel>(
    `/matches/${matchId}/not-held`,
    { reason },
  );
  return data;
}

/**
 * Отменить смену, о которой договорились.
 *
 * Заболел, передумал, планы поменялись — самое частое событие в подработке.
 * Раньше выхода не было: оставалось просто не прийти, и человек получал
 * отметку «неявка» наравне с теми, кто пропал молча.
 */
export async function cancelShift(
  matchId: string,
  reason = "",
): Promise<MatchModel> {
  if (!USE_BACKEND) return mock.cancelShift(matchId, reason);
  const { data } = await api.post<MatchModel>(`/matches/${matchId}/cancel`, {
    reason,
  });
  return data;
}

/**
 * Заведение указывает фактическую длительность смены.
 *
 * Опоздал, ушёл раньше, задержался — оплата и комиссия считаются по факту.
 * Работник видит изменение в чате и может открыть спор.
 */
export async function setActualHours(
  matchId: string,
  minutes: number,
  note = "",
): Promise<MatchModel> {
  if (!USE_BACKEND) return mock.setActualHours(matchId, minutes, note);
  const { data } = await api.post<MatchModel>(`/matches/${matchId}/hours`, {
    minutes,
    note,
  });
  return data;
}

/** Заведение предлагает перенести смену. Работник соглашается или нет. */
export async function proposeReschedule(
  matchId: string,
  date: string,
  startTime: number,
  endTime: number,
): Promise<MatchModel> {
  if (!USE_BACKEND) return mock.proposeReschedule(matchId, date);
  const { data } = await api.post<MatchModel>(
    `/matches/${matchId}/reschedule`,
    { date, start_time: startTime, end_time: endTime },
  );
  return data;
}

export async function answerReschedule(
  matchId: string,
  accept: boolean,
): Promise<MatchModel> {
  if (!USE_BACKEND) return mock.answerReschedule(matchId, accept);
  const { data } = await api.post<MatchModel>(
    `/matches/${matchId}/reschedule/${accept ? "accept" : "decline"}`,
    {},
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

export interface InvoiceLink {
  link: string;
}


export interface Me {
  id: string;
  role: AppRole;
  name: string;
  rating: number;
  tgUsername?: string | null;
  city?: string;
  district?: string;
  incomingLikes?: number;
  earnedRub?: number;
  shiftsDone?: number;
  availableToday?: boolean;
  profileCompletion?: number;
  birthDate?: string;
  roles?: string[];
  selfEmployed?: boolean;
  inn?: string | null;
  about?: string;
  experienceTags?: string[];
  photoUrl?: string;
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
  experience_tags?: string[];
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
  employersTotal?: number;
}

/** Работники, уже выходившие на смены заведения — чтобы позвать снова. */
export async function fetchMyWorkers(): Promise<Worker[]> {
  if (!USE_BACKEND) return mock.fetchMyWorkers();
  // Имена полей — уже camelCase: ответы переименовывает перехватчик в
  // client.ts. Здесь читались серверные имена со знаком подчёркивания, то
  // есть всегда undefined: на экране «Мои работники» пропадали и надёжность
  // («вышел на N из M»), и отметка «готов сегодня». В mock-режиме всё
  // выглядело правильно — потому и не замечалось.
  const { data } = await api.get<Worker[]>("/employer/workers");
  return data;
}

/**
 * Позвать работника снова. Возвращает, ушло ли ему сообщение: второй раз
 * подряд мы намеренно молчим, чтобы не спамить, и кнопка должна честно
 * сказать «уже звали», а не показывать успех повторно.
 */
export async function inviteWorker(userId: string): Promise<boolean> {
  if (!USE_BACKEND) return mock.inviteWorker(userId);
  const { data } = await api.post<{ notified: boolean }>(
    `/employer/invite/${userId}`, {});
  return data.notified !== false;
}

export interface Applicant {
  id: string;
  name: string;
  age?: number | null;
  district: string;
  roles: string[];
  medBook: string;
  rating: number;
  photoUrls: string[];
  about: string;
  availableToday: boolean;
  shiftsTotal: number;
  shiftsAttended: number;
  employersTotal?: number;
  /** Заведение уже отказало — но человек остаётся в списке: передумать можно. */
  declined?: boolean;
  vacancyId: string;
  vacancyRole: string;
  vacancyDate: string;
  vacancyStart: number;
  vacancyEnd: number;
}

/** Кто откликнулся на мои смены и ждёт ответа. */
export async function fetchApplicants(): Promise<Applicant[]> {
  if (!USE_BACKEND) return mock.fetchApplicants();
  const { data } = await api.get<Applicant[]>("/employer/applicants");
  return data;
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
  headcount?: number;
  address?: string;
  city?: string;
  lat?: number;
  lng?: number;
  interior_photo_url?: string;
}

/** Публикация вакансии работодателем. */
export async function createVacancy(input: VacancyInput): Promise<Vacancy> {
  if (!USE_BACKEND) return mock.createVacancy(input);
  const { data } = await api.post<Vacancy>("/vacancies", input);
  return data;
}

/** Исправить свою смену. 409 — по ней уже есть отклик, условия менять нельзя. */
export async function updateVacancy(
  id: string,
  input: VacancyInput,
): Promise<Vacancy> {
  if (!USE_BACKEND) return mock.updateVacancy(id, input);
  const { data } = await api.put<Vacancy>(`/vacancies/${id}`, input);
  return data;
}

/** Снять свою смену с публикации. 409 — по ней уже есть отклик. */
export async function deleteVacancy(id: string): Promise<void> {
  if (!USE_BACKEND) return mock.deleteVacancy(id);
  await api.delete(`/vacancies/${id}`);
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
    return { open: 1200, swipe: 940, match: 410, confirm: 180, done: 121 };
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
  completedShifts: number;
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
  /** Факты по спорной смене — только для жалоб на смену. Без них оператору
   *  предлагалось выбрать между «засчитать смену» и «неявкой» вслепую. */
  dispute?: {
    worker: string;
    venue: string;
    shiftWhen: string;
    checkedInByCode: boolean;
    venueMarkedAttended: boolean;
    notHeldBy: string;
    payRub: number;
    commission: string;
    status: string;
  } | null;
}

export interface AdminBlocked {
  type: string;
  id: string;
  info: string;
}

export interface AdminRevenue {
  commissionAccruedRub: number;
  commissionPaidRub: number;
  commissionPendingRub: number;
  /** Прощено по спорам и признано безнадёжным — в выручку не входит. */
  commissionWrittenOffRub: number;
  shiftsBilled: number;
  /** Пополнений баланса всего: и картой, и зачисленных оператором. */
  topupsRub: number;
  topupsCardRub: number;
  topupsManualRub: number;
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

export interface City {
  name: string;
  tz: string;
}

/** Города, в которых работает сервис.
 *
 *  Список берём с сервера, а не держим копию здесь: две копии неизбежно
 *  разъезжаются, а разъехавшийся город — это пустая лента, причину которой
 *  невозможно объяснить человеку. */
export async function fetchCities(): Promise<City[]> {
  if (!USE_BACKEND) return mock.fetchCities();
  const { data } = await api.get<City[]>("/cities");
  return data;
}

export interface AdminUser {
  id: string;
  role: "seeker" | "employer";
  name: string;
  username?: string | null;
  blocked: boolean;
  warnings: number;
  balanceRub: number;
  /** Бейдж «Проверено» — только для заведений. */
  verified?: boolean;
}

/** Поставить или снять заведению бейдж «Проверено».
 *
 *  Автоматически его выдать нельзя: ИНН — публичные данные, и «нашёлся в
 *  справочнике» доказывает только умение гуглить. Ставит оператор, поговорив
 *  с заведением. */
export async function adminVerifyEmployer(
  employerId: string,
  verified: boolean,
): Promise<boolean> {
  if (!USE_BACKEND) return mock.adminVerifyEmployer(employerId, verified);
  const { data } = await api.post<{ verified: boolean }>(
    `/admin/employers/${employerId}/verify`, { verified },
  );
  return data.verified;
}

/** Поиск людей/заведений в админке (по имени, @нику, телефону). */
export async function adminSearchUsers(q: string): Promise<AdminUser[]> {
  if (!USE_BACKEND) return mock.adminSearchUsers(q);
  const { data } = await api.get<AdminUser[]>("/admin/users", { params: { q } });
  return data;
}

export interface RepeatPair {
  employer: string;
  worker: string;
  shifts: number;
}

/** Пары, закрывшие больше одной смены: возвращаются ли люди к нам. */
export async function fetchRepeatPairs(): Promise<RepeatPair[]> {
  if (!USE_BACKEND) return mock.fetchRepeatPairs();
  const { data } = await api.get<RepeatPair[]>("/admin/repeat-pairs");
  return data;
}

/** Закрыть состоявшиеся смены и начислить комиссию.
 *
 *  Смена состоялась, если после её окончания никто не сказал обратного —
 *  название `autoCloseShifts` осталось от старого правила, когда смену
 *  закрывали только две нажатые кнопки. */
export async function settleShifts(): Promise<number> {
  if (!USE_BACKEND) return mock.settleShifts();
  const { data } = await api.post<{ closed: number }>("/admin/shifts/auto-close", {});
  return data.closed;
}

/** Разослать напоминания о сегодняшних сменах (с кнопкой «Я на смене»). */
export async function sendShiftReminders(): Promise<number> {
  if (!USE_BACKEND) return mock.sendShiftReminders();
  const { data } = await api.post<{ sent: number }>("/admin/reminders/send", {});
  return data.sent;
}

/** Спросить обе стороны про вчерашние смены — единственное предупреждение
 *  перед списанием комиссии. Ничего не закрывает. */
export async function askAfterShift(): Promise<number> {
  if (!USE_BACKEND) return mock.askAfterShift();
  const { data } = await api.post<{ closed: number }>(
    "/admin/shifts/close-abandoned", {});
  return data.closed;
}

/** Предупредить заведения о завтрашних сменах, на которые никто не откликнулся. */
export async function sendUnfilledAlerts(): Promise<number> {
  if (!USE_BACKEND) return mock.sendUnfilledAlerts();
  const { data } = await api.post<{ sent: number }>(
    "/admin/shifts/unfilled-alerts", {});
  return data.sent;
}

/** Сверить платежи с ЮKassa и дозачислить те, по которым не дошёл вебхук. */
export async function reconcilePayments(): Promise<number> {
  if (!USE_BACKEND) return mock.reconcilePayments();
  const { data } = await api.post<{ credited: number }>(
    "/admin/payments/reconcile", {});
  return data.credited ?? 0;
}

export interface CancelStatRow {
  ownerId: string;
  name: string;
  role: "employer" | "seeker";
  cancels: number;
  lateCancels: number;
  noShows: number;
  /** Сколько раз сторона заявила «смена не состоялась» — единственный способ
   *  не платить за договорённую смену, а значит самый дешёвый обход правила
   *  «молчание = смена состоялась». Сервер это считал, а экран не показывал. */
  notHeld?: number;
}

/** Кто систематически отменяет смены и не выходит. */
export async function fetchCancelStats(days = 60): Promise<CancelStatRow[]> {
  if (!USE_BACKEND) return mock.fetchCancelStats();
  const { data } = await api.get<CancelStatRow[]>("/admin/cancel-stats", {
    params: { days },
  });
  return data;
}

/** Списать неоплаченную комиссию: прощена по спору или долг безнадёжен. */
export async function writeOffCommission(
  employerId: string,
  reason: string,
): Promise<number> {
  if (!USE_BACKEND) return mock.writeOffCommission();
  const { data } = await api.post<{ amountRub: number }>(
    `/admin/commissions/${employerId}/write-off`, { reason });
  return data.amountRub;
}

/** Вернуть деньги с баланса заведения (возврат или исправление ошибки). */
export async function adminRefundWallet(
  ownerId: string,
  amountRub: number,
  note = "",
): Promise<number> {
  if (!USE_BACKEND) return mock.adminRefundWallet();
  const { data } = await api.post<{ balanceRub: number }>(
    `/admin/wallet/${ownerId}/refund`, { amount_rub: amountRub, note });
  return data.balanceRub;
}

export interface PaymentRow {
  id: string;
  ownerId: string;
  sku: string;
  provider: string;
  amount: number;
  currency: string;
  status: string;
  createdAt: string;
}

/** Журнал платежей: что и кому приходило. */
export async function fetchPayments(): Promise<PaymentRow[]> {
  if (!USE_BACKEND) return mock.fetchPayments();
  const { data } = await api.get<PaymentRow[]>("/admin/purchases");
  return data;
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
  balanceRub: number;
  topupAvailable: boolean;
  /** Выдаются ли счёт и акт: без реквизитов получателя документы не
   *  формируются, и кнопки показывать нельзя. */
  docsAvailable?: boolean;
}

/** Мой счёт по комиссии (для заведения): сколько накопилось и не просрочен ли. */
export async function fetchMyCommission(): Promise<CommissionInfo> {
  if (!USE_BACKEND) return mock.fetchMyCommission();
  const { data } = await api.get<CommissionInfo>("/billing/commission");
  return data;
}

/** Пополнение денежного баланса картой (ЮKassa) — вернёт ссылку на оплату. */
export interface PaymentUrl {
  url: string;
}

export async function walletTopup(amountRub: number): Promise<PaymentUrl> {
  if (!USE_BACKEND) return { url: "https://example.com/pay/wallet_topup" };
  const { data } = await api.post<PaymentUrl>("/billing/wallet/topup", {
    amount_rub: amountRub,
  });
  return data;
}

/** Перенос аккаунта на новый Telegram (потерян доступ). История сохраняется. */
export async function adminRelink(
  ownerId: string,
  newTgId: number,
): Promise<void> {
  if (!USE_BACKEND) return mock.adminRelink(ownerId, newTgId);
  await api.post("/admin/relink", { owner_id: ownerId, new_tg_id: newTgId });
}

/**
 * Завершить все сессии аккаунта («потерял телефон»). Человек просто откроет
 * приложение заново — вход в Telegram произойдёт сам. Это не блокировка.
 */
export async function adminLogoutAll(ownerId: string): Promise<void> {
  if (!USE_BACKEND) return mock.adminLogoutAll(ownerId);
  await api.post(`/admin/users/${ownerId}/logout-all`, {});
}

/**
 * Удаление персональных данных по заявлению (152-ФЗ). Необратимо: профиль
 * обезличивается, привязка к Telegram снимается. Смены и начисленная
 * комиссия остаются — это бухгалтерия.
 */
export async function adminEraseAccount(
  ownerId: string,
): Promise<Record<string, number>> {
  if (!USE_BACKEND) return mock.adminEraseAccount(ownerId);
  const { data } = await api.post<{ removed: Record<string, number> }>(
    `/admin/users/${ownerId}/erase`,
    {},
  );
  return data.removed;
}

/**
 * Ссылка на счёт или акт от сервиса заведению (PDF).
 *
 * Ресторану-юрлицу без этих двух документов не оплатить по безналу и не
 * поставить расход. Токен идёт в адресе: PDF открывает браузер по прямой
 * ссылке, заголовки он не передаёт.
 */
export function billingDocUrl(kind: "invoice" | "act"): string {
  const token = getToken() ?? "";
  return `${baseURL}/billing/${kind}.pdf?token=${encodeURIComponent(token)}`;
}

/** Оператор зачисляет аванс на баланс заведения (принял СБП/счёт). */
export async function adminCreditWallet(
  ownerId: string,
  amountRub: number,
): Promise<void> {
  if (!USE_BACKEND) return mock.adminCreditWallet(ownerId, amountRub);
  await api.post(`/admin/wallet/${ownerId}/credit`, { amount_rub: amountRub });
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

/**
 * Загрузка фото: подписанная форма → прямая отправка в хранилище → публичный URL.
 *
 * Форма (а не PUT) нужна ради ограничения размера: подписанный PUT принимает
 * файл ЛЮБОГО объёма, и одним запросом можно было забить хранилище. Условие
 * на размер проверяет само хранилище, обойти его нельзя.
 */
export async function uploadPhoto(file: File): Promise<string> {
  if (!USE_BACKEND) {
    throw new Error("Загрузка фото доступна только с backend");
  }
  // Первые 16 байт файла — проба, по которой сервер проверяет НАСТОЯЩИЙ тип.
  // Заявленному типу верить нельзя: назвать что угодно «image/jpeg» может кто
  // угодно, а хранилище содержимое не проверяет.
  const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const headHex = Array.from(head)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  const { data } = await api.post<{
    upload_url: string;
    fields: Record<string, string>;
    public_url: string;
    max_bytes: number;
  }>(
    "/uploads/photo-url",
    { content_type: file.type, head_hex: headHex },
    // raw: поля формы подписаны хранилищем, переименование ломает подпись.
    // Заодно это чинило бы саму загрузку: без него адрес хранилища приезжал
    // как undefined, и файл уходил «в никуда» — на пилоте с подключённым
    // S3 фото не сохранялось бы вообще.
    { raw: true },
  );

  if (file.size > data.max_bytes) {
    throw new Error(
      `Фото больше ${Math.round(data.max_bytes / 1024 / 1024)} МБ — выберите поменьше`,
    );
  }

  const form = new FormData();
  // Поля от хранилища идут ПЕРЕД файлом — иначе подпись не проверится.
  Object.entries(data.fields).forEach(([k, v]) => form.append(k, v));
  form.append("file", file);
  // Прямая отправка в хранилище — без наших интерсепторов и JWT.
  await axios.post(data.upload_url, form);
  return data.public_url;
}


