import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/Button";
import { Logo } from "@/components/Logo";
import { IconChat, IconDoc, IconMoney, IconBolt } from "@/components/Icons";
import { currentCampaign } from "@/lib/campaign";

// Пришёл по рекламной ссылке (шортс/ролик) — показываем цепляющий экран под
// обещание видео и один CTA. Обычный онбординг пропускаем: у зрителя ~3 секунды
// внимания, ведём сразу к смене.
function CampaignHook({ onStart }: { onStart: () => void }) {
  const camp = currentCampaign()!;
  return (
    <div className="app">
      <div
        className="page"
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          textAlign: "center",
          gap: 16,
        }}
      >
        <div className="onb-demo" aria-hidden style={{ marginBottom: 4 }}>
          <Logo size={88} color="var(--on-brand)" />
          <span className="onb-demo-like">♥</span>
        </div>
        <h1 className="h1" style={{ maxWidth: 340 }}>{camp.title}</h1>
        <p className="muted" style={{ fontSize: "var(--text-md)", maxWidth: 330 }}>{camp.sub}</p>
        <span
          className="tag"
          style={{
            color: "var(--super-text)", borderColor: "var(--super-text)",
            fontWeight: 700, padding: "8px 14px", gap: 6,
          }}
        >
          <IconBolt size={15} /> Оплата напрямую · есть смены без опыта
        </span>
        <p className="muted small">
          Новые смены появляются каждый день
        </p>
        {/* haptic здесь больше не вызываем: Button сам даёт лёгкую отдачу. */}
        <Button style={{ maxWidth: 360, marginTop: 8 }} onClick={onStart}>
          Смотреть смены рядом
        </Button>
      </div>
    </div>
  );
}

const SLIDES = [
  {
    Icon: null,
    // Никаких «от N ₽»: конкретную сумму мы обещать не можем — ставку
    // назначает заведение, и человек, зашедший на цифру и увидевший в ленте
    // меньше, перестаёт верить всему остальному.
    title: "Смены рядом с домом — на один день",
    text: "Кафе и рестораны у дома ищут людей на конкретную смену. Вправо — «хочу», влево — мимо. Платит заведение напрямую — способ и срок написаны в каждой карточке.",
  },
  {
    Icon: IconChat,
    title: "Мэтч → чат → смена",
    text: "Понравились друг другу — открывается чат. Договорились — подтверждаете смену в один тап.",
  },
  {
    Icon: IconDoc,
    title: "Акт для самозанятого",
    // «Всё по-белому» звучало как юридическая гарантия от сервиса, хотя
    // отношения с налоговой у человека свои. Говорим ровно то, что делаем.
    text: "После смены формируется акт в PDF. Чек — в «Мой налог».",
  },
];

export function Onboarding() {
  const [i, setI] = useState(0);
  const nav = useNavigate();
  const last = i === SLIDES.length - 1;
  const slide = SLIDES[i];

  // Пришёл по рекламной ссылке → сразу цепляющий экран под ролик.
  if (currentCampaign()) return <CampaignHook onStart={() => nav("/role")} />;

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
            <div className="onb-demo" aria-hidden>
              <Logo size={92} color="var(--on-brand)" />
              <span className="onb-demo-skip">✕</span>
              <span className="onb-demo-like">♥</span>
            </div>
          ) : (
            <span
              style={{
                width: 110,
                height: 110,
                borderRadius: "var(--radius-lg)",
                background: "var(--grad-brand)",
                color: "var(--on-brand)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <slide.Icon size={56} />
            </span>
          )}
          <h1 className="h1">{slide.title}</h1>
          <p className="muted" style={{ fontSize: "var(--text-base)", maxWidth: 320 }}>
            {slide.text}
          </p>
          {i === 0 && (
            <span
              className="tag"
              style={{
                color: "var(--super-text)",
                borderColor: "var(--super-text)",
                fontWeight: 700,
                padding: "8px 14px",
                gap: 6,
              }}
            >
              <IconMoney size={15} /> Оплата напрямую · без посредников
            </span>
          )}
        </div>
        <p className="muted" style={{ textAlign: "center", fontSize: "var(--text-xs)", marginBottom: 12 }}>
          Новые смены появляются каждый день
        </p>
        <div className="row" style={{ justifyContent: "center", marginBottom: 20 }}>
          {SLIDES.map((_, idx) => (
            <span
              key={idx}
              style={{
                width: idx === i ? 22 : 8,
                height: 8,
                borderRadius: 99,
                background: idx === i ? "var(--gold-fill)" : "var(--border-strong)",
                transition: "width .2s",
              }}
            />
          ))}
        </div>
        <Button
          onClick={() => {
            if (last) nav("/role");
            else setI(i + 1);
          }}
        >
          {last ? "Начать" : "Далее"}
        </Button>
      </div>
    </div>
  );
}
