import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]),' +
  ' textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Сколько модальных окон открыто сейчас. Фон прячем от скринридера на первом
// и возвращаем на последнем: шторка «Пожаловаться» открывается поверх списка,
// и при её закрытии фон не должен «проснуться» раньше времени.
let openCount = 0;
const root = () => document.getElementById("root");

function hideBackground() {
  openCount += 1;
  if (openCount === 1) root()?.setAttribute("aria-hidden", "true");
}

function showBackground() {
  openCount = Math.max(0, openCount - 1);
  if (openCount === 0) root()?.removeAttribute("aria-hidden");
}

/**
 * Поведение модального окна: фокус переводится внутрь и возвращается назад
 * при закрытии, Escape закрывает, табуляция ходит по кругу внутри окна, фон
 * скрыт от скринридера.
 *
 * Раньше шторки были обычными div-ами: скринридер продолжал читать ленту под
 * ними, а с клавиатуры из открытой шторки нельзя было ни выйти, ни перестать
 * попадать на кнопки фона.
 *
 * Возвращённый ref нужно повесить на само окно — у него должны быть
 * role="dialog", aria-modal и tabIndex={-1}.
 */
export function useDialog<T extends HTMLElement>(onClose: () => void) {
  const ref = useRef<T>(null);
  // onClose почти везде приходит новой стрелкой на каждый рендер. Если
  // положить его в зависимости, эффект перезапускался бы и таскал фокус.
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });

  useEffect(() => {
    const box = ref.current;
    const restoreTo = document.activeElement as HTMLElement | null;
    hideBackground();
    // Фон под шторкой не должен прокручиваться. Иначе движение пальцем по
    // краю листа прокручивает ленту ПОД ним: человек закрывает шторку и
    // обнаруживает, что список уехал куда-то вниз сам собой.
    const bodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    box?.focus();

    function focusables(): HTMLElement[] {
      if (!box) return [];
      return Array.from(box.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => !el.hasAttribute("hidden") && el.getAttribute("aria-hidden") !== "true",
      );
    }

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        closeRef.current();
        return;
      }
      if (e.key !== "Tab" || !box) return;
      const list = focusables();
      if (list.length === 0) {
        e.preventDefault();
        box.focus();
        return;
      }
      const first = list[0];
      const last = list[list.length - 1];
      const active = document.activeElement;
      if (!box.contains(active)) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
      } else if (e.shiftKey && (active === first || active === box)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKey, true);
    return () => {
      document.body.style.overflow = bodyOverflow;
      document.removeEventListener("keydown", onKey, true);
      showBackground();
      restoreTo?.focus?.();
    };
  }, []);

  return ref;
}

/**
 * Нижняя шторка: фильтры, детали смены, жалоба. Один компонент на все —
 * чтобы диалоговая семантика и поведение фокуса были везде одинаковыми.
 */
export function Sheet({
  title,
  onClose,
  children,
  footer,
  grab = true,
}: {
  /** Заголовок шторки — он же её имя для скринридера. */
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  /** Закреплённый низ (кнопки действий), не уезжает при прокрутке тела. */
  footer?: ReactNode;
  grab?: boolean;
}) {
  const titleId = useId();
  const box = useDialog<HTMLDivElement>(onClose);

  // Портал в body: иначе шторка наследует анимацию и задержку появления
  // родительского списка (.stagger) и всплывает с запозданием.
  return createPortal(
    <div className="sheet-backdrop" onClick={onClose}>
      <div
        ref={box}
        className="fade-up sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        {grab && <div className="sheet-grab" aria-hidden />}
        <div className="sheet-body">
          <h2 className="h2" id={titleId} style={{ marginTop: 0 }}>
            {title}
          </h2>
          {children}
        </div>
        {footer && <div className="sheet-foot">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
