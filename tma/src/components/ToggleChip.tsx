/** Чип-переключатель: выбранная должность, фильтр, вариант ответа.
 *
 *  Был написан в пяти местах подряд — и каждый раз одними и теми же четырьмя
 *  строками инлайн-стилей, хотя классы для обоих состояний давно есть:
 *  `.tag-gold-fill` («выбрано») и `.tag-nav` («можно выбрать»). Инлайн сильнее
 *  любого правила, поэтому расхождение не выдавало себя ничем: поменяешь цвет
 *  выбранного чипа в стилях — и он поменяется везде, кроме этих пяти мест.
 */
import type { ReactNode } from "react";
import { haptic } from "@/telegram/sdk";

export function ToggleChip({
  on,
  label,
  onClick,
  small = false,
  wide = false,
}: {
  on: boolean;
  label: ReactNode;
  onClick: () => void;
  /** Мелкий кегль — для плотных списков, где чипов по три в строке. */
  small?: boolean;
  /** Ровная ширина — для чипов из одной цифры («сколько человек нужно»):
   *  иначе «1» и «10» разной ширины и ряд выглядит рваным. */
  wide?: boolean;
}) {
  return (
    <button
      type="button"
      className={`tag ${on ? "tag-gold-fill" : "tag-nav"}`
        + (small ? " tag-sm" : "") + (wide ? " tag-num" : "")}
      aria-pressed={on}
      onClick={() => {
        haptic("select");
        onClick();
      }}
    >
      {label}
    </button>
  );
}
