import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { haptic } from "@/telegram/sdk";
import { Logo } from "@/components/Logo";
import { IconChat, IconDoc, IconMoney } from "@/components/Icons";

const SLIDES = [
  {
    Icon: null,
    title: "Подработка рядом — от 3 000 ₽ за смену",
    text: "Свайпай смены в кафе и ресторанах у дома. Вправо — «хочу», влево — мимо. Первую найдёшь за пару минут.",
  },
  {
    Icon: IconChat,
    title: "Мэтч → чат → смена",
    text: "Понравились друг другу — открывается чат. Договорились — подтверждаете смену в один тап.",
  },
  {
    Icon: IconDoc,
    title: "Акт для самозанятого",
    text: "После смены формируется акт в PDF. Чек — в «Мой налог». Всё по-белому.",
  },
];

export function Onboarding() {
  const [i, setI] = useState(0);
  const nav = useNavigate();
  const last = i === SLIDES.length - 1;
  const slide = SLIDES[i];

  return (
    <div className="app">
      <div className="page" style={{ display: "flex", flexDirection: "column" }}>
        <div style={{ textAlign: "right" }}>
          <button
            className="tab"
            style={{ width: "auto", flex: "none", color: "var(--muted)" }}
            onClick={() => nav("/role")}
          >
            Пропустить
          </button>
        </div>
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            textAlign: "center",
            gap: 16,
          }}
        >
          {i === 0 || !slide.Icon ? (
            <Logo size={100} color="var(--gold)" />
          ) : (
            <span
              style={{
                width: 110,
                height: 110,
                borderRadius: 30,
                background: "var(--grad-brand)",
                color: "#fff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <slide.Icon size={56} />
            </span>
          )}
          <h1 className="h1">{slide.title}</h1>
          <p className="muted" style={{ fontSize: 15, maxWidth: 320 }}>
            {slide.text}
          </p>
          {i === 0 && (
            <span
              className="tag"
              style={{
                color: "var(--super)",
                borderColor: "var(--super)",
                fontWeight: 700,
                padding: "8px 14px",
                gap: 6,
              }}
            >
              <IconMoney size={15} /> Оплата в день смены · без посредников
            </span>
          )}
        </div>
        <p className="muted" style={{ textAlign: "center", fontSize: 12.5, marginBottom: 12 }}>
          ★ 4.8 · 1 200+ смен закрыто · заведения уже здесь
        </p>
        <div className="row" style={{ justifyContent: "center", marginBottom: 20 }}>
          {SLIDES.map((_, idx) => (
            <span
              key={idx}
              style={{
                width: idx === i ? 22 : 8,
                height: 8,
                borderRadius: 99,
                background: idx === i ? "var(--gold)" : "var(--border)",
                transition: "width .2s",
              }}
            />
          ))}
        </div>
        <button
          className="btn"
          onClick={() => {
            haptic("light");
            if (last) nav("/role");
            else setI(i + 1);
          }}
        >
          {last ? "Начать" : "Далее"}
        </button>
      </div>
    </div>
  );
}
