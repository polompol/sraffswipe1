import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { showBackButton, haptic } from "@/telegram/sdk";
import { Button } from "@/components/Button";
import { IconChat } from "@/components/Icons";

// Ссылка на поддержку (Telegram-чат/бот). Задаётся через env перед запуском.
const SUPPORT_URL =
  import.meta.env.VITE_SUPPORT_URL || "https://t.me/staffswipe_support";

const FAQ: { q: string; a: string }[] = [
  {
    q: "Как откликнуться на смену?",
    a: "Листайте карточки смен. Свайп вправо или ♥ — «хочу здесь работать». Если заведение ответит взаимно — откроется чат.",
  },
  {
    q: "Как подтвердить смену и получить акт?",
    a: "После договорённости в чате обе стороны жмут «Подтвердить смену». Затем в разделе «Смены» формируется PDF-акт для самозанятого.",
  },
  {
    q: "Как отметиться на смене?",
    a: "В день смены нажмите «Я на смене». Подтвердить можно двумя способами: назвать 6-значный код, который скажет заведение, или включить геолокацию, если вы уже на месте. Заведение со своей стороны отмечает «человек пришёл» — только после обеих отметок смена считается закрытой.",
  },
  {
    q: "Сколько стоит приложение?",
    a: "Работникам — бесплатно, всегда. Заведение платит комиссию 10% от оплаты смены, и только за состоявшуюся смену: не вышли — платить не за что. Оплатить можно картой через ЮKassa или переводом. Данные карт мы не храним — оплата идёт на стороне платёжной системы.",
  },
  {
    q: "Деньги за смену идут через приложение?",
    a: "Нет. Оплату за смену вы получаете напрямую от заведения. Приложение только сводит вас и формирует акт — это информационный сервис, не работодатель.",
  },
  {
    q: "Я столкнулся с обманом / просят предоплату",
    a: "Никогда не вносите предоплату за трудоустройство — это мошенничество. Нажмите «⚠ Пожаловаться» в чате или на смене. Мы проверим и заблокируем нарушителя.",
  },
  {
    q: "Мои данные в безопасности? (152-ФЗ)",
    a: "Да. Данные хранятся на серверах в РФ, обрабатываются по 152-ФЗ. Точные координаты и контакты не раскрываются до мэтча.",
  },
];

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="card" style={{ padding: 0, overflow: "hidden" }}>
      <button
        className="row"
        style={{
          width: "100%",
          background: "none",
          border: "none",
          padding: "14px 16px",
          cursor: "pointer",
          textAlign: "left",
          color: "var(--text)",
          font: "inherit",
        }}
        aria-expanded={open}
        onClick={() => {
          haptic("select");
          setOpen((v) => !v);
        }}
      >
        <b style={{ flex: 1, fontSize: 14.5 }}>{q}</b>
        <span style={{ color: "var(--gold)", transition: "transform .2s", transform: open ? "rotate(45deg)" : "none" }}>
          ＋
        </span>
      </button>
      {open && (
        <div className="muted fade-up" style={{ padding: "0 16px 14px", fontSize: 14, lineHeight: 1.55 }}>
          {a}
        </div>
      )}
    </div>
  );
}

export function SupportPage() {
  const nav = useNavigate();
  useEffect(() => showBackButton(() => nav(-1)), [nav]);

  return (
    <div className="app">
      <div className="page">
        <h1 className="h1" style={{ marginBottom: 4 }}>Помощь</h1>
        <p className="muted" style={{ marginBottom: 16 }}>
          Частые вопросы. Не нашли ответ — напишите нам.
        </p>

        <div className="stagger" style={{ display: "grid", gap: 10, marginBottom: 20 }}>
          {FAQ.map((f) => (
            <FaqItem key={f.q} q={f.q} a={f.a} />
          ))}
        </div>

        <a href={SUPPORT_URL} target="_blank" rel="noreferrer" style={{ textDecoration: "none" }}>
          <Button variant="secondary" onClick={() => haptic("light")}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
              <IconChat size={18} /> Написать в поддержку
            </span>
          </Button>
        </a>
      </div>
    </div>
  );
}
