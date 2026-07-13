import { useEffect, useState } from "react";
import { coin } from "@/lib/sfx";
import { haptic } from "@/telegram/sdk";

// «Денежный дождь» — фирменный момент радости при закрытии смены. Работные
// приложения обычно скучные и утилитарные; здесь день зарплаты ощущается как
// выигрыш: рубли-монеты сыплются, сумма набегает с нуля, звучит «ка-чинг».
// Лёгкий (чистый CSS + один таймер), без тяжёлых библиотек.

const COINS = Array.from({ length: 26 });

function useCountUp(target: number, ms: number): number {
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (target <= 0) return;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / ms);
      // easeOutCubic — быстро в начале, мягко в конце.
      const eased = 1 - Math.pow(1 - t, 3);
      setVal(Math.round(target * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return val;
}

export function MoneyRain({
  amount,
  onDone,
}: {
  amount: number;
  onDone: () => void;
}) {
  const shown = useCountUp(amount, 1100);

  useEffect(() => {
    coin();
    haptic("success");
    const t = setTimeout(onDone, 3000);
    return () => clearTimeout(t);
  }, [onDone]);

  return (
    <div className="overlay money-rain" onClick={onDone}>
      {COINS.map((_, i) => (
        <span
          key={i}
          className="coin"
          style={{
            left: `${(i * 3.9 + (i % 3) * 4) % 100}%`,
            animationDuration: `${1.5 + ((i * 7) % 12) / 10}s`,
            animationDelay: `${((i * 13) % 9) / 10}s`,
          }}
        >
          ₽
        </span>
      ))}
      <div style={{ position: "relative", textAlign: "center" }}>
        <div style={{ fontSize: 20, fontWeight: 800, color: "#fff", opacity: 0.9 }}>
          Смена закрыта ✓
        </div>
        <div
          style={{
            fontSize: 56,
            fontWeight: 900,
            color: "var(--super)",
            lineHeight: 1.1,
            margin: "6px 0",
            textShadow: "0 4px 24px rgba(217,164,65,.5)",
          }}
        >
          +{shown.toLocaleString("ru-RU")} ₽
        </div>
        <div style={{ fontSize: 16, color: "#fff", opacity: 0.85 }}>
          Деньги твои. Так держать 🔥
        </div>
      </div>
    </div>
  );
}
