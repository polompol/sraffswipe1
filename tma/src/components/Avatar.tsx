import { useState, type ReactNode } from "react";

/**
 * Лицо человека или заведения: фото, а если его нет или ссылка битая —
 * первая буква имени на брендовом градиенте.
 *
 * Списки людей в приложении были набраны одним текстом: «Мария, 27 · ★ 4.9 ·
 * Басманный». Решение «беру или нет» принимают по человеку, а не по строчкам,
 * и в ленте оно так и устроено — там карточка с фотографией. А в списке
 * откликов, ради которого заведение и заходит, лица не было вовсе.
 *
 * Реализаций этого квадрата было три: здесь, в «Моих сменах» (своя копия с
 * тем же кодом) и в профиле (набранная прямо в разметке). Различались только
 * размером и тем, что показывать вместо буквы. Теперь это один компонент:
 * размер — числом или из CSS-класса, запасной знак — пропом.
 */
export function Avatar({
  src,
  name,
  size,
  className,
  fallback,
}: {
  src?: string;
  name?: string;
  /** Сторона квадрата. Без него размер задаёт класс (например, .match-ava). */
  size?: number;
  className?: string;
  /** Что показать вместо буквы: у профиля без имени — иконка. */
  fallback?: ReactNode;
}) {
  const [ok, setOk] = useState(!!src);
  const initial = (name || "").trim().charAt(0).toUpperCase();
  return (
    <span
      aria-hidden
      className={`avatar${className ? ` ${className}` : ""}`}
      style={size ? { width: size, height: size } : undefined}
    >
      {!ok && (initial || fallback)}
      {src && (
        <img src={src} alt="" onError={() => setOk(false)} style={{ opacity: ok ? 1 : 0 }} />
      )}
    </span>
  );
}
