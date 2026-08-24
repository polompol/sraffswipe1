import type { ReactNode } from "react";
import { IconChevronRight, IconSkip } from "@/components/Icons";

/**
 * ГЛАВНЫЕ ФИЛЬТРЫ — СРАЗУ НА ЭКРАНЕ.
 *
 * Раньше всё жило в шторке за иконкой: чтобы понять, по каким условиям
 * показана лента, надо было её открыть. Человек не помнит, что включил вчера,
 * и пустая лента читалась как «смен нет», хотя на самом деле стоял фильтр.
 *
 * Теперь четыре главных условия видны всегда, и по каждому понятно: выключено
 * (тихий чип со стрелкой) или включено (залитый чип со значением и крестиком).
 * Крестик снимает фильтр в одно нажатие — не открывая шторку. Остальные
 * условия остаются в шторке: их меняют раз в жизни.
 */
export interface Chip {
  /** Что фильтруем: «Роль», «Район». */
  label: string;
  /** Выбранное значение, если фильтр включён: «Бариста», «от 400 ₽». */
  value?: string;
  /** Число рядом со значением — сколько нашлось. Отдельным полем, а не
   *  внутри value: у .chip-text стоит обрезка по 11 знакам, и «Санкт-Петербург
   *  · 12» превращалось в «Санкт-Пете…» — число пропадало совсем именно там,
   *  где оно и нужно: отличить «фильтр слишком узкий» от «смен нет». */
  count?: number;
  icon?: ReactNode;
  /** Нажатие по чипу: включить или открыть выбор. */
  onPick: () => void;
  /** Снять фильтр. Нет — значит чип просто переключается нажатием. */
  onClear?: () => void;
  /** Чип открывает выбор (шторку), а не переключается сам. У таких — стрелка;
   *  у переключателей её быть не должно, иначе они обещают выбор, которого нет. */
  picker?: boolean;
}

export function FilterChips({ chips }: { chips: Chip[] }) {
  return (
    // Ряд прокручивается вбок: на экране 320 четыре чипа со значениями в
    // строку не помещаются, а переносить их на вторую строку нельзя — это
    // отняло бы у карточки полсотни точек.
    <div className="chips-row" role="group" aria-label="Фильтры">
      {chips.map((c) => {
        const on = !!c.value;
        return (
          <span key={c.label} className={`chip${on ? " chip-on" : ""}`}>
            <button
              type="button"
              className="chip-main"
              aria-pressed={on}
              // Вслух: «Роль: Бариста» — а не просто «Бариста», иначе
              // непонятно, что это фильтр и по какому полю.
              aria-label={
                (on ? `${c.label}: ${c.value}` : c.label)
                + (c.count != null ? `, найдено: ${c.count}` : "")
              }
              onClick={c.onPick}
            >
              {c.icon}
              <span className="chip-text">{on ? c.value : c.label}</span>
              {c.count != null && <span className="chip-count">{c.count}</span>}
              {!on && c.picker && (
                <span aria-hidden className="chip-caret">
                  <IconChevronRight size={13} />
                </span>
              )}
            </button>
            {on && c.onClear && (
              <button
                type="button"
                className="chip-clear"
                aria-label={`Снять фильтр: ${c.label}`}
                onClick={c.onClear}
              >
                <IconSkip size={13} />
              </button>
            )}
          </span>
        );
      })}
    </div>
  );
}
