import { useState } from "react";
import { leaveReview } from "@/api/endpoints";
import { haptic } from "@/telegram/sdk";

/** Звезда: залитая золотом или пустой контур. */
function Star({ filled, size = 34 }: { filled: boolean; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.9 6.1 20.5l1.2-6.5L2.5 9.4l6.6-.9z"
        fill={filled ? "var(--gold)" : "none"}
        stroke={filled ? "var(--gold)" : "var(--dislike, #cbb9a7)"}
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Оценка смены ★1–5 в один тап. Показываем сразу после закрытия смены —
 *  момент наивысшей эмоции, отзывов собирается больше. Звёзды пустые и
 *  заполняются при выборе, чтобы не путать с уже выставленной оценкой. */
export function ReviewStars({ matchId }: { matchId: string }) {
  const [done, setDone] = useState(false);
  const [picked, setPicked] = useState(0); // выбранная оценка
  const [hover, setHover] = useState(0);   // подсветка при наведении

  if (done) {
    return (
      <div className="muted" style={{ marginTop: 12, textAlign: "center" }}>
        Спасибо за отзыв ★
      </div>
    );
  }

  const active = hover || picked;

  async function rate(stars: number) {
    setPicked(stars);
    haptic("success");
    try {
      await leaveReview(matchId, stars, "");
      setDone(true);
    } catch {
      haptic("error");
      setPicked(0);
    }
  }

  return (
    <div style={{ marginTop: 14, textAlign: "center" }}>
      <div className="muted" style={{ marginBottom: 8 }}>
        Как прошла смена? Нажмите на звёзды
      </div>
      <div
        style={{ display: "inline-flex", gap: 6 }}
        onMouseLeave={() => setHover(0)}
      >
        {[1, 2, 3, 4, 5].map((s) => (
          <button
            key={s}
            aria-label={`Оценка ${s} из 5`}
            onMouseEnter={() => setHover(s)}
            onClick={() => rate(s)}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: 4,
              lineHeight: 0,
            }}
          >
            <Star filled={s <= active} />
          </button>
        ))}
      </div>
    </div>
  );
}
