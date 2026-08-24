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

/** Дата словами и с днём недели: «29 августа, вторник».
 *
 *  Поле выбора даты рисует сама система телефона, и формат берётся из её
 *  языка: на английском телефоне это «08/29/2026». Спутать 08/29 и 29/08 в
 *  чужом формате легко, а цена ошибки — смена в другой день. Поэтому под
 *  полем повторяем выбранное по-русски.
 */
export function dateLong(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const week = ["воскресенье", "понедельник", "вторник", "среда",
    "четверг", "пятница", "суббота"];
  return `${d.getDate()} ${MONTHS[d.getMonth()]}, ${week[d.getDay()]}`;
}

/** Смена «горит» — она сегодня. Такие показываем с пометкой «Срочно». */
export function isUrgentShift(dateIso: string): boolean {
  return dateIso === todayISO();
}

/** Дробное число по-русски: «7,5», «4,7».
 *
 *  toFixed даёт точку — «7.5 ч», «4.7». Рядом на той же карточке сумма уже
 *  набрана по-русски («4 500» с неразрывным пробелом), и точка в соседней
 *  строке читается как опечатка. В деталях смены она попадала прямо в
 *  денежную строку: «350 ₽/час × 7.5 ч ≈ 2 625 ₽».
 */
export function dec1(n: number): string {
  return n.toLocaleString("ru-RU", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}

/** Сколько мест на смене осталось: «свободно 1 из 4».
 *
 *  Одна фраза на оба вида ленты. Раньше в списке писали «набрано 3 из 4», а
 *  на карточке — «Нужно 4 человека · свободно 1»: вид переключается кнопкой
 *  в шапке, и по одной и той же смене человек видел то «3», то «1». Пусто,
 *  когда место всего одно, — там считать нечего.
 */
export function slotsLabel(headcount?: number, slotsLeft?: number): string {
  const need = headcount ?? 1;
  if (need <= 1) return "";
  const left = slotsLeft ?? need;
  if (left <= 0) return "мест не осталось";
  return `свободно ${left} из ${need}`;
}

/** Сколько часов длится смена: 20:00–04:00 — это 8, а не −16.
 *
 *  Нужна там, где поле надо предзаполнить из самой смены. Раньше в шторке
 *  «Сколько часов вышло» всегда стояло «8», а в переносе — «10:00» и
 *  «18:00»: у ночной смены администратор менял только дату, и смена молча
 *  становилась дневной. А на этих часах считаются оплата и комиссия.
 */
export function shiftLengthHours(m: {
  shiftStart?: number;
  shiftEnd?: number;
}): number {
  let mins = (m.shiftEnd ?? 0) - (m.shiftStart ?? 0);
  if (mins <= 0) mins += 1440;
  return Math.round((mins / 60) * 10) / 10;
}

/** Число по-русски, дробная часть — только если она есть: «8», «7,5».
 *
 *  Для длительности смены: «8,0 ч» выглядело бы придиркой, а «7.5 ч» с
 *  точкой — опечаткой.
 */
export function numRu(n: number): string {
  return n.toLocaleString("ru-RU", { maximumFractionDigits: 1 });
}

/** Ставка с суффиксом: «350 ₽/час», «4 500 ₽/смена».
 *
 *  Разряды обязательны: плашка на карточке давала «4500 ₽/смена», а тело той
 *  же карточки и детали смены — «4 500 ₽». Человек видел два разных числа на
 *  одном экране и начинал сверять, не разные ли это деньги.
 */
export function rateLabel(rate: number, type: RateType): string {
  return `${rate.toLocaleString("ru-RU")} ${RATE_SUFFIX[type]}`;
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
/** Сколько дней после смены работник может пожаловаться, что ему не заплатили.
 *
 *  Две недели — с запасом: наличные обычно отдают в тот же вечер, а «занесу
 *  завтра» тянется несколько дней. Бесконечное окно не годится: через полгода
 *  разобраться, кто прав, уже невозможно, а оператору такая жалоба ничего не
 *  даст. */
export const NOT_PAID_WINDOW_DAYS = 14;

/** Можно ли ещё пожаловаться «мне не заплатили».
 *
 *  Только по закрытой смене и только пока не вышло окно. До этого в приложении
 *  не оставалось ни одного хода: кнопка «Проблема» жила лишь пока смена не
 *  закрыта, а закрывается она сама через 12 часов после окончания. */
export function canReportNoPay(m: {
  status?: string;
  disputed?: boolean;
  shiftDate?: string;
  shiftStart?: number;
  shiftEnd?: number;
}): boolean {
  if (m.status !== "completed" || m.disputed) return false;
  if (!shiftEnded(m)) return false;
  const at = shiftMoment(m.shiftDate, m.shiftEnd);
  if (at === null) return true; // даты нет — не отнимаем у человека ход
  const days = (Date.now() - at.getTime()) / 86400000;
  return days <= NOT_PAID_WINDOW_DAYS;
}

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
  // Запятая, а не точка-разделитель: строка «Бариста · 25 августа · 10:00–18:00»
  // на узкой карточке переносится, и «·» оставался висеть в конце строки —
  // читалось как обрыв. Запятая в конце строки — обычная пунктуация.
  return `${shiftDayLabel(m.shiftDate)}, ${fmtTime(m.shiftStart ?? 0)}–${fmtTime(m.shiftEnd ?? 0)}`;
}
