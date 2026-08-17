import { plural } from "./format";

/** Надёжность человека одной строкой: «вышел на 5 из 5 смен · 3 заведения».
 *
 *  Число РАЗНЫХ заведений здесь не для красоты. Пять смен с пятью заведениями
 *  и пять смен с одним — разный опыт и разная степень доверия, а по одному
 *  счётчику смен их не отличить. Именно на этом держалась накрутка: пара
 *  сговорившихся аккаунтов (или один человек с двумя Telegram) закрывает
 *  смену за сменой, и в ленте появляется безупречная история.
 *
 *  У новичка строки нет вовсе — врать про «0 из 0» не нужно.
 */
export function reliabilityText(
  shiftsTotal?: number,
  shiftsAttended?: number,
  employersTotal?: number,
): string {
  if (!shiftsTotal) return "";
  const base = `вышел на ${shiftsAttended ?? 0} из ${shiftsTotal} смен`;
  const n = employersTotal ?? 0;
  if (!n) return base;
  return `${base} · ${n} ${plural(n, "заведение", "заведения", "заведений")}`;
}
