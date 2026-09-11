import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/Button";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { showBackButton, haptic, openTelegram } from "@/telegram/sdk";
import { IconChat, IconCalendar, IconMoney, IconShield, IconHelp } from "@/components/Icons";

// Ссылка на поддержку (Telegram-чат/бот). Задаётся через env перед запуском.
const SUPPORT_URL =
  import.meta.env.VITE_SUPPORT_URL || "https://t.me/staffswipe_support";

const FAQ: { q: string; a: string }[] = [
  {
    q: "Как откликнуться на смену?",
    a: "Листайте карточки смен. Свайп вправо или кнопка «Откликнуться» — «хочу здесь работать». Если заведение ответит взаимно — откроется чат.",
  },
  {
    q: "Как подтвердить смену и получить акт?",
    a: "После договорённости в чате обе стороны жмут «Подтвердить смену». Акт появится в разделе «Мои смены» после закрытия смены. Если нет спора, она закроется автоматически через 12 часов после окончания; если обе стороны подтвердили выход, закрытие возможно раньше, но только после окончания смены.",
  },
  {
    q: "Что нужно сделать после смены?",
    a: "Проверьте, что смена прошла по договорённости. Она закроется автоматически через 12 часов после окончания, если нет спора. Если смены не было или условия не совпали, откройте «Мои смены» → «Что-то пошло не так» до автоматического закрытия.",
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
    a: "Рабочая переписка доступна участникам смены и поддержке для разбора споров. Правила обработки данных и согласия доступны в разделе «Настройки» → «Документы».",
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
  const [topic, setTopic] = useState("all");
  useEffect(() => showBackButton(() => nav(-1)), [nav]);

  return (
    <div className="app">
      <div className="page">
        <PageHeader title="Помощь" backTo="/profile" subtitle="Выберите тему — найдём следующий шаг" />
        <div className="help-topics">
          <button className="card help-topic" onClick={() => nav("/matches")}><IconCalendar /><b>Смена и выход</b><small>Код прихода, отмена, спор</small></button>
          <button className="card help-topic" aria-pressed={topic === "money"} onClick={() => setTopic(topic === "money" ? "all" : "money")}><IconMoney /><b>Оплата</b><small>Комиссия и расчёты</small></button>
          <button className="card help-topic" onClick={() => nav("/settings")}><IconShield /><b>Профиль и данные</b><small>Настройки и документы</small></button>
          <button className="card help-topic" aria-pressed={topic === "all"} onClick={() => setTopic("all")}><IconHelp /><b>Частые вопросы</b><small>Как работает сервис</small></button>
        </div>
        <h2 className="h2">{topic === "money" ? "Про оплату" : "Ответы на вопросы"}</h2>
        {topic !== "all" && <Button variant="ghost" onClick={() => setTopic("all")}>Все вопросы</Button>}

        <div className="stagger" style={{ display: "grid", gap: 10, marginBottom: 20 }}>
          {FAQ.filter((_, i) => topic !== "money" || [4, 5, 6].includes(i)).map((f) => (
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
