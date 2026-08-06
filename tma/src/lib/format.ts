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

/** Сегодняшняя дата в формате ISO yyyy-mm-dd (совпадает с генерацией mock). */
export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Подпись дня смены: «Сегодня»/«Завтра» или дата — для чувства срочности. */
export function shiftDayLabel(iso: string): string {
  const today = todayISO();
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
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
