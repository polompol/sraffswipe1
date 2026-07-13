import { useEffect, useState } from "react";
import { leaveReview } from "@/api/endpoints";
import { coin } from "@/lib/sfx";
import { haptic } from "@/telegram/sdk";

// Экран закрытия смены в стиле Uber: сразу «за смену заработано столько-то» +
// оценка звёздами в один заход, без лишних шагов. Работные приложения обычно
// скучные — здесь день зарплаты ощущается как выигрыш: рубли сыплются, сумма
// набегает с нуля, «ка-чинг», и тут же ставишь звёзды. Лёгкий, чистый CSS.

const COINS = Array.from({ length: 22 });

// Уважаем системную настройку «уменьшить движение»: без дождя монет.
const reducedMotion =
  typeof window !== "undefined" &&
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

function useCountUp(target: number, ms: number): number {
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (target <= 0) return;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / ms);
      const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
      setVal(Math.round(target * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return val;
}

/** Звезда для оценки на тёмном фоне: пустой контур → золото при выборе. */
function Star({ filled }: { filled: boolean }) {
  return (
    <svg width={40} height={40} viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.9 6.1 20.5l1.2-6.5L2.5 9.4l6.6-.9z"
        fill={filled ? "var(--super)" : "none"}
        stroke={filled ? "var(--super)" : "rgba(255,255,255,.55)"}
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function MoneyRain({
  amount,
  matchId,
  onDone,
}: {
  amount: number;
  matchId: string;
  onDone: () => void;
}) {
  const shown = useCountUp(amount, 1100);
  const [hover, setHover] = useState(0);
  const [picked, setPicked] = useState(0);
  const [rated, setRated] = useState(false);
  const active = hover || picked;

  useEffect(() => {
    coin();
    haptic("success");
  }, []);

  async function rate(stars: number) {
    setPicked(stars);
    haptic("success");
    try {
      await leaveReview(matchId, stars, "");
    } catch {
      /* уже оценивал — не страшно, всё равно закрываем с благодарностью */
    }
    setRated(true);
    setTimeout(onDone, 1100);
  }

  return (
    <div className="overlay money-rain" onClick={onDone}>
      {!reducedMotion &&
        COINS.map((_, i) => (
          <span
            key={i}
            className="coin"
            style={{
              left: `${(i * 4.6 + (i % 3) * 4) % 100}%`,
              animationDuration: `${1.5 + ((i * 7) % 12) / 10}s`,
              animationDelay: `${((i * 13) % 9) / 10}s`,
            }}
          >
            ₽
          </span>
        ))}

      {/* останавливаем всплытие: клики по контенту не закрывают экран */}
      <div
        style={{ position: "relative", textAlign: "center", maxWidth: 340 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ fontSize: 19, fontWeight: 800, color: "#fff", opacity: 0.9 }}>
          Смена закрыта ✓
        </div>
        <div
          style={{
            fontSize: 52,
            fontWeight: 900,
            color: "var(--super)",
            lineHeight: 1.1,
            margin: "6px 0 2px",
            textShadow: "0 4px 24px rgba(217,164,65,.5)",
          }}
        >
          +{shown.toLocaleString("ru-RU")} ₽
        </div>
        <div style={{ fontSize: 15, color: "#fff", opacity: 0.8 }}>
          за смену. Деньги твои 🔥
        </div>

        {/* Оценка звёздами — сразу, как в Uber */}
        <div style={{ marginTop: 22 }}>
          {rated ? (
            <div style={{ color: "#fff", fontSize: 16, fontWeight: 700 }}>
              Спасибо за отзыв ★
            </div>
          ) : (
            <>
              <div style={{ color: "#fff", opacity: 0.8, marginBottom: 8, fontSize: 15 }}>
                Как прошла смена?
              </div>
              <div
                style={{ display: "inline-flex", gap: 4 }}
                onMouseLeave={() => setHover(0)}
              >
                {[1, 2, 3, 4, 5].map((s) => (
                  <button
                    key={s}
                    aria-label={`Оценка ${s} из 5`}
                    onMouseEnter={() => setHover(s)}
                    onClick={() => rate(s)}
                    style={{
                      background: "none", border: "none", cursor: "pointer",
                      padding: 3, lineHeight: 0,
                    }}
                  >
                    <Star filled={s <= active} />
                  </button>
                ))}
              </div>
              <div style={{ marginTop: 14 }}>
                <button
                  onClick={onDone}
                  style={{
                    background: "none", border: "none", cursor: "pointer",
                    color: "rgba(255,255,255,.7)", fontSize: 14,
                  }}
                >
                  Позже
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
