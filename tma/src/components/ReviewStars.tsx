import { useState } from "react";
import { leaveReview } from "@/api/endpoints";
import { haptic } from "@/telegram/sdk";

/** Оценка смены ★1–5 в один тап. Показываем сразу после закрытия смены —
 *  момент наивысшей эмоции, отзывов собирается больше (цикл «как у Яндекса»:
 *  оценил → рейтинг на карточке → зовут чаще → хочется выходить ещё). */
export function ReviewStars({ matchId }: { matchId: string }) {
  const [done, setDone] = useState(false);
  if (done) {
    return <div className="muted" style={{ marginTop: 10 }}>Спасибо за отзыв ★</div>;
  }
  return (
    <div className="row" style={{ marginTop: 12, gap: 8, flexWrap: "wrap" }}>
      <span className="muted">Оцените смену:</span>
      {[1, 2, 3, 4, 5].map((s) => (
        <button
          key={s}
          aria-label={`${s} звёзд`}
          style={{
            background: "none",
            border: "none",
            fontSize: 26,
            cursor: "pointer",
            padding: "2px 2px",
            lineHeight: 1,
          }}
          onClick={async () => {
            haptic("success");
            try {
              await leaveReview(matchId, s, "");
              setDone(true);
            } catch {
              haptic("error");
            }
          }}
        >
          ⭐
        </button>
      ))}
    </div>
  );
}
