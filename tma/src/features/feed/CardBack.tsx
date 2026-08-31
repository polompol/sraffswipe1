import type { ReactNode } from "react";
import { IconBack } from "@/components/Icons";

/**
 * Изнанка свайп-карточки.
 *
 *  Раньше подробности открывались шторкой снизу. Шторка — отдельный слой
 *  поверх экрана: карточка уезжала под неё, и связь «это та же смена»
 *  держалась только на памяти. Переворот эту связь показывает: у карточки
 *  просто есть вторая сторона, и она никуда не уходит.
 *
 *  Заголовок и подсказка «коснитесь, чтобы вернуться» прижаты к краям, а
 *  содержимое между ними прокручивается: описание смены — свободный текст, и
 *  предугадать его длину нельзя. Без прокрутки длинное описание обрезало бы
 *  оговорку про деньги, а она там самая важная.
 */
export function CardBack({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="card-back-inner">
      <div className="card-back-head">{title}</div>
      <div className="card-back-scroll">{children}</div>
      <div className="card-back-hint">
        <IconBack size={15} /> Коснитесь, чтобы вернуться
      </div>
    </div>
  );
}
