import { useState } from "react";

/**
 * Лицо человека или заведения: фото, а если его нет или ссылка битая — буква
 * имени на брендовом градиенте.
 *
 * Списки людей в приложении были набраны одним текстом: «Мария, 27 · ★ 4.9 ·
 * Басманный». Решение «беру или нет» принимают по человеку, а не по строчкам,
 * и в ленте оно так и устроено — там карточка с фотографией. А в списке
 * откликов, ради которого заведение и заходит, лица не было вовсе.
 */
export function Avatar({
  src,
  name,
  size = 48,
}: {
  src?: string;
  name?: string;
  size?: number;
}) {
  const [ok, setOk] = useState(!!src);
  const initial = (name || "?").trim().charAt(0).toUpperCase();
  return (
    <span
      aria-hidden
      style={{
        width: size,
        height: size,
        borderRadius: size / 4,
        flex: "none",
        position: "relative",
        overflow: "hidden",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--grad-brand)",
        color: "#fff",
        fontWeight: 800,
        fontSize: size > 44 ? "var(--text-lg)" : "var(--text-md)",
      }}
    >
      {!ok && initial}
      {src && (
        <img
          src={src}
          alt=""
          onError={() => setOk(false)}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            opacity: ok ? 1 : 0,
          }}
        />
      )}
    </span>
  );
}
