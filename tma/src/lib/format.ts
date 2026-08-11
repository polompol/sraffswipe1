import type { RateType, Vacancy } from "@/types/domain";
import { RATE_SUFFIX } from "@/types/domain";

export function fmtTime(minutes: number): string {
  const h = String(Math.floor(minutes / 60)).padStart(2, "0");
  const m = String(minutes % 60).padStart(2, "0");
  return `${h}:${m}`;
}

const MONTHS = [
  "января", "февраля", "марта", "апреля", "мая", "июня",
  "июля", "августа", "сентября", "октября", "ноября", "декабря",
];

export function fmtDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

/** Дата как ГГГГ-ММ-ДД по МЕСТНОМУ времени телефона.
 *
 *  Не через toISOString(): он отдаёт дату по Гринвичу, а Москва на три часа
 *  впереди. С полуночи до трёх ночи приложение жило вчерашним днём: бармен
 *  после смены жал чип «Сегодня» и видел «смен нет» (сервер считает дату по
 *  Москве и всё отсекал), а сегодняшняя смена была подписана «Завтра» и без
 *  плашки «Сегодня» — ровно в те часы, когда горящие смены и ищут. */
export function localISO(d: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Сегодняшняя дата в формате ISO гггг-мм-дд (по времени телефона). */
export function todayISO(): string {
  return localISO();
}

/** Подпись дня смены: «Сегодня»/«Завтра» или дата — для чувства срочности. */
export function shiftDayLabel(iso: string): string {
  const today = todayISO();
  const tomorrow = localISO(new Date(Date.now() + 86400000));
  if (iso === today) return "Сегодня";
  if (iso === tomorrow) return "Завтра";
  return fmtDate(iso);
}

/** Смена «горит» — она сегодня. Такие показываем с пометкой «Срочно». */
export function isUrgentShift(dateIso: string): boolean {
  return dateIso === todayISO();
}

export function rateLabel(rate: number, type: RateType): string {
  return `${rate} ${RATE_SUFFIX[type]}`;
}

export function estimatedPay(v: Vacancy): number {
  if (v.rateType === "perShift") return v.rate;
  // Ночные смены (20:00→04:00) переходят за полночь — добавляем сутки.
  let mins = v.endTime - v.startTime;
  if (mins <= 0) mins += 1440;
  return Math.round((v.rate * mins) / 60);
}

/** Русское склонение по числу: 1 смена, 2 смены, 5 смен. */
export function plural(n: number, one: string, few: string, many: string): string {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  if (b === 1) return one;
  return many;
}

/** Момент начала/конца смены по времени телефона. Пусто — считаем, что смена
 *  ещё не начиналась: лучше показать лишнюю кнопку, чем спрятать нужную. */
function shiftMoment(date?: string, minutes?: number): Date | null {
  if (!date) return null;
  const [y, m, d] = date.split("-").map(Number);
  if (!y || !m || !d) return null;
  const at = new Date(y, m - 1, d, 0, 0, 0, 0);
  at.setMinutes(minutes ?? 0);
  return at;
}

/** Смена уже началась? Отменять и переносить её поздно — сервер откажет. */
export function shiftStarted(m: {
  shiftDate?: string;
  shiftStart?: number;
}): boolean {
  const at = shiftMoment(m.shiftDate, m.shiftStart);
  return at !== null && Date.now() >= at.getTime();
}

/** Смена уже закончилась? Только после этого можно сказать «не состоялась».
 *  Ночная смена (конец меньше начала) заканчивается на следующий день. */
export function shiftEnded(m: {
  shiftDate?: string;
  shiftStart?: number;
  shiftEnd?: number;
}): boolean {
  const at = shiftMoment(m.shiftDate, m.shiftEnd);
  if (at === null) return false;
  if ((m.shiftEnd ?? 0) <= (m.shiftStart ?? 0)) {
    at.setDate(at.getDate() + 1);
  }
  return Date.now() >= at.getTime();
}

/** «12 августа, 10:00–18:00» — одной строкой для карточки смены. */
export function shiftWhen(m: {
  shiftDate?: string;
  shiftStart?: number;
  shiftEnd?: number;
}): string {
  if (!m.shiftDate) return "";
  return `${shiftDayLabel(m.shiftDate)} · ${fmtTime(m.shiftStart ?? 0)}–${fmtTime(m.shiftEnd ?? 0)}`;
}
