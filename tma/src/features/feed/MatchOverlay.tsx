import { useId } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import type { MatchModel } from "@/types/domain";
import { IconTabMatches, IconChat } from "@/components/Icons";
import { useDialog } from "@/components/Sheet";

// Конфетти — фирменными токенами, чтобы в тёмной теме они светлели вместе
// с брендом, а не оставались отдельной светлой палитрой.
const COLORS = [
  "var(--gold)",
  "var(--gold-soft)",
  "var(--super)",
  "var(--crimson-dark)",
];

export function MatchOverlay({
  match,
  onClose,
}: {
  match: MatchModel;
  onClose: () => void;
}) {
  const nav = useNavigate();
  const confetti = Array.from({ length: 36 });
  const titleId = useId();
  // Оверлей перекрывает весь экран, поэтому ведёт себя как модальное окно:
  // фокус внутрь, Escape закрывает, фон не читается скринридером. Раньше это
  // был обычный div — с клавиатуры фокус оставался на кнопках ленты под ним.
  const box = useDialog<HTMLDivElement>(onClose);

  // Портал в body: скринридер прячет фон целиком (#root), а оверлей должен
  // остаться снаружи этого «спрятанного» куска.
  return createPortal(
    <div
      className="overlay"
      ref={box}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      tabIndex={-1}
    >
      {confetti.map((_, i) => (
        <span
          key={i}
          className="confetti"
          aria-hidden
          style={{
            left: `${(i * 2.8) % 100}%`,
            top: `-${Math.random() * 20}px`,
            background: COLORS[i % COLORS.length],
            animationDuration: `${1.6 + Math.random() * 1.4}s`,
            animationDelay: `${Math.random() * 0.4}s`,
          }}
        />
      ))}
      <div
        aria-hidden
        style={{
          position: "absolute",
          width: 320,
          height: 320,
          borderRadius: "50%",
          background:
            // Оверлей всегда тёмный независимо от темы, поэтому свечение задаём
            // фиксированным золотом (--super) — надёжнее color-mix в старых вебвью.
            "radial-gradient(circle, rgba(195,154,58,0.45) 0%, rgba(195,154,58,0) 70%)",
          filter: "blur(8px)",
        }}
        className="pulse"
      />
      {/* Оверлей всегда тёмный, независимо от темы, поэтому цвет заголовка
          фиксированный. --gold в светлой теме — глубокий багровый, и на почти
          чёрной подложке он давал 2.17:1: самый радостный момент продукта
          выглядел тёмным пятном. */}
      <div
        id={titleId}
        style={{ fontSize: "var(--text-hero)", fontWeight: 900, color: "#e8c268", position: "relative" }}
      >
        Это мэтч!
      </div>
      <div style={{ margin: "12px 0", position: "relative" }}>
        {match.companyPhotoUrl ? (
          <img
            className="match-avatar"
            src={match.companyPhotoUrl}
            alt={match.companyName ?? "заведение"}
            onError={(e) => {
              e.currentTarget.style.display = "none";
              e.currentTarget.nextElementSibling?.removeAttribute("hidden");
            }}
          />
        ) : null}
        <div
          className="match-avatar"
          hidden={!!match.companyPhotoUrl}
          style={{ color: "#fff" }}
        >
          <IconTabMatches size={54} active />
        </div>
      </div>
      <p style={{ color: "#e6dccd", maxWidth: 300 }}>
        Вы и «{match.companyName ?? "заведение"}» понравились друг другу
      </p>
      <div style={{ width: "100%", maxWidth: 340, marginTop: 24, display: "grid", gap: 10 }}>
        <button
          className="btn"
          onClick={() => {
            onClose();
            nav(`/chat/${match.id}`);
          }}
        >
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            <IconChat size={18} /> Перейти в чат
          </span>
        </button>
        {/* Оверлей всегда тёмный, поэтому вторая кнопка — прозрачная с белым
            текстом. Раньше она была светлой на светлом фоне (контраст ~1.3:1)
            и выглядела пустой плашкой на самом важном экране. */}
        <button
          className="btn secondary"
          style={{
            background: "transparent",
            color: "#fff",
            borderColor: "rgba(255,255,255,.45)",
          }}
          onClick={onClose}
        >
          Продолжить листать
        </button>
      </div>
    </div>,
    document.body,
  );
}
