import { Button } from "./Button";
import { IconStar } from "./Icons";
import { useState } from "react";
import { leaveReview } from "@/api/endpoints";
import { haptic } from "@/telegram/sdk";
import { toast } from "@/components/Toast";
import { apiError } from "@/lib/errors";

/** Оценка и комментарий после закрытия смены. Выбор звезды — черновик;
 *  отзыв уходит только по явному нажатию «Отправить отзыв». */
export function ReviewStars({ matchId }: { matchId: string }) {
  const [done, setDone] = useState(false);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
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

  async function rate() {
    setBusy(true);
    haptic("success");
    try {
      await leaveReview(matchId, picked, comment.trim());
      setDone(true);
    } catch (e) {
      // Звёзды загорались и гасли без объяснения — человек жал ещё раз и
      // получал отказ «отзыв уже оставлен».
      haptic("error");
      toast(apiError(e, "Оценка не ушла — попробуйте ещё раз"), "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ marginTop: 14, textAlign: "center" }}>
      <div className="muted" style={{ marginBottom: 8 }}>
        Как прошла смена? Нажмите на звёзды
      </div>
      {/* Класс: на экране 320 пять звёзд с зазорами занимают ровно ширину
          карточки, и по краям не остаётся ни точки поля. */}
      <div
        className="stars-row"
        style={{ display: "inline-flex" }}
        onMouseLeave={() => setHover(0)}
      >
        {[1, 2, 3, 4, 5].map((s) => (
          <button
            key={s}
            aria-label={`Оценка ${s} из 5`}
            onMouseEnter={() => setHover(s)}
            aria-pressed={picked === s}
            disabled={busy}
            onClick={() => { setPicked(s); haptic("select"); }}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              // Звезда 34px + padding 4 давали кнопку 42px — чуть меньше
              // минимальных 44px, и по крайним звёздам промахивались.
              padding: 6,
              lineHeight: 0,
            }}
          >
            <span style={{ color: s <= active ? "var(--super-text)" : "var(--muted)", opacity: s <= active ? 1 : .55 }}><IconStar size={32} /></span>
          </button>
        ))}
      </div>
      {picked > 0 && <div className="stack" style={{ marginTop: 12, textAlign: "left" }}>
        <label className="form-label" htmlFor={`review-${matchId}`}>Комментарий — по желанию</label>
        <textarea id={`review-${matchId}`} className="input" maxLength={1000} rows={3} placeholder="Что понравилось и что можно улучшить?" value={comment} onChange={(e) => setComment(e.target.value)} />
        <Button loading={busy} onClick={rate}>Отправить отзыв</Button>
      </div>}
    </div>
  );
}
