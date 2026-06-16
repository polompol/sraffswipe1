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

export function rateLabel(rate: number, type: RateType): string {
  return `${rate} ${RATE_SUFFIX[type]}`;
}

export function estimatedPay(v: Vacancy): number {
  if (v.rateType === "perShift") return v.rate;
  const hours = Math.max(0, (v.endTime - v.startTime) / 60);
  return Math.round(v.rate * hours);
}
