import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { showBackButton, haptic, openTelegram } from "@/telegram/sdk";
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
    a: "После договорённости в чате обе стороны жмут «Подтвердить смену». Акт появится в разделе «Мои смены» после того, как смена закроется — это происходит само через 12 часов после её окончания.",
  },
  {
    q: "Что нужно сделать после смены?",
    a: "Ничего. Смена, о которой вы договорились, закрывается сама через 12 часов после окончания — акт появится в разделе «Мои смены». Нажать что-то нужно только если смена НЕ состоялась: там же кнопка «Смена не состоялась».",
  },
  {
    q: "Зачем код прихода?",
    a: "Это ваше доказательство. Попросите код у администратора, когда придёте, и введите в приложении. Код знает только заведение — значит, вы были на месте. После этого заведение уже не сможет записать смену в неявку без разбора: спор уйдёт к оператору.",
  },
  {
    q: "Сколько стоит приложение?",
    a: "Работникам — бесплатно, всегда. Заведение платит комиссию 10% от оплаты смены, и только за состоявшуюся смену: не вышли — платить не за что. Оплатить можно картой через ЮKassa или переводом. Данные карт мы не храним — оплата идёт на стороне платёжной системы.",
  },
  {
    q: "Мне не заплатили за смену. Что делать?",
    a: "Откройте «Мои смены», найдите эту смену и нажмите «Мне не заплатили за смену» — кнопка доступна две недели после смены. Оператор свяжется с обеими сторонами. Деньги идут напрямую от заведения, поэтому вернуть их через приложение нельзя, но заведение, которое не платит, мы отключаем от сервиса.",
  },
  {
    q: "Деньги за смену идут через приложение?",
    a: "Нет. Оплату за смену вы получаете напрямую от заведения. Приложение только сводит вас и формирует акт — это информационный сервис, не работодатель.",
  },
  {
    q: "Меня обманывают или просят деньги вперёд",
    a: "Никогда не вносите предоплату за трудоустройство — это мошенничество. Нажмите «Пожаловаться» в чате или на смене. Мы проверим и заблокируем нарушителя.",
  },
  {
    q: "Мои данные в безопасности?",
    a: "Да. Данные хранятся на серверах в РФ, обрабатываются по 152-ФЗ. Точный адрес и контакты открываются, только когда вы договорились.",
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
        <b style={{ flex: 1, fontSize: "var(--text-sm)" }}>{q}</b>
        <span style={{ color: "var(--gold)", transition: "transform .2s", transform: open ? "rotate(45deg)" : "none" }}>
          ＋
        </span>
      </button>
      {open && (
        <div className="muted fade-up" style={{ padding: "0 16px 14px", fontSize: "var(--text-sm)", lineHeight: 1.55 }}>
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

        {/* Ссылка, стилизованная под кнопку. Раньше внутри <a> лежала
            настоящая <button>: вложенные интерактивные элементы — скринридер
            объявлял их как два разных объекта, а с клавиатуры фокус
            останавливался дважды на одном и том же действии. */}
        {/* openTelegramLink, а не новое окно: ссылка ведёт на t.me, и через
            обычное открытие Telegram показал бы собственный домен во
            встроенном браузере вместо перехода в чат поддержки. */}
        <a
          className="ui-btn ui-btn--secondary"
          href={SUPPORT_URL}
          onClick={(e) => { e.preventDefault(); haptic("light"); openTelegram(SUPPORT_URL); }}
          style={{
            width: "100%",
            minHeight: 54,
            padding: "0 20px",
            fontSize: "var(--text-md)",
            color: "var(--text)",
            textDecoration: "none",
          }}
        >
          <IconChat size={18} /> Написать в поддержку
        </a>
      </div>
    </div>
  );
}
