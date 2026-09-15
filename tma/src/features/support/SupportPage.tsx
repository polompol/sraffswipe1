import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { createSupportCase, fetchSupportCases } from "@/api/support";
import type { SupportTopic } from "@/api/support";
import { Button } from "@/components/Button";
import {
  IconCalendar,
  IconChat,
  IconHelp,
  IconMoney,
  IconShield,
} from "@/components/Icons";
import { PageHeader } from "@/components/PageHeader";
import { haptic, openTelegram, showBackButton } from "@/telegram/sdk";

const SUPPORT_URL =
  import.meta.env.VITE_SUPPORT_URL || "https://t.me/staffswipe_support";

const TOPICS: { value: SupportTopic; label: string }[] = [
  { value: "shift", label: "Смена" },
  { value: "payment", label: "Оплата" },
  { value: "account", label: "Аккаунт" },
  { value: "safety", label: "Безопасность" },
  { value: "other", label: "Другое" },
];

const STATUS_LABEL = {
  open: "Открыто",
  answered: "Есть ответ",
  closed: "Закрыто",
} as const;

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
    a: "Никогда не вносите предоплату за трудоустройство — это мошенничество. Нажмите «Пожаловаться» в чате или на смене. Мы проверим ситуацию вручную.",
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
          setOpen((value) => !value);
        }}
      >
        <b style={{ flex: 1, fontSize: "var(--text-sm)" }}>{q}</b>
        <span
          style={{
            color: "var(--gold)",
            transition: "transform .2s",
            transform: open ? "rotate(45deg)" : "none",
          }}
        >
          ＋
        </span>
      </button>
      {open && (
        <div
          className="muted fade-up"
          style={{
            padding: "0 16px 14px",
            fontSize: "var(--text-sm)",
            lineHeight: 1.55,
          }}
        >
          {a}
        </div>
      )}
    </div>
  );
}

export function SupportPage() {
  const nav = useNavigate();
  const queryClient = useQueryClient();
  const [faqTopic, setFaqTopic] = useState("all");
  const [caseTopic, setCaseTopic] = useState<SupportTopic | "">("");
  const [caseText, setCaseText] = useState("");

  useEffect(() => showBackButton(() => nav(-1)), [nav]);

  const cases = useQuery({
    queryKey: ["support-cases"],
    queryFn: fetchSupportCases,
  });

  const createCase = useMutation({
    mutationFn: ({ topic, text }: { topic: SupportTopic; text: string }) =>
      createSupportCase(topic, text),
    onSuccess: async () => {
      setCaseTopic("");
      setCaseText("");
      await queryClient.invalidateQueries({ queryKey: ["support-cases"] });
      await cases.refetch();
    },
  });

  const trimmedText = caseText.trim();
  const canSubmit =
    Boolean(caseTopic) && trimmedText.length >= 5 && !createCase.isPending;

  return (
    <div className="app">
      <div className="page">
        <PageHeader
          title="Помощь"
          backTo="/profile"
          subtitle="Выберите тему — найдём следующий шаг"
        />

        <section className="card" style={{ marginBottom: 16 }}>
          <h2 className="h2" style={{ marginTop: 0 }}>Сообщить о проблеме</h2>
          <p className="muted" style={{ marginTop: 0 }}>
            Обращение получит номер и останется в истории. Ответ оператора появится здесь.
          </p>
          <label htmlFor="support-topic" style={{ display: "block", marginBottom: 6 }}>
            Тема обращения
          </label>
          <select
            id="support-topic"
            className="input"
            value={caseTopic}
            disabled={createCase.isPending}
            onChange={(event) => setCaseTopic(event.target.value as SupportTopic | "")}
            style={{ width: "100%", marginBottom: 10 }}
          >
            <option value="">Выберите тему</option>
            {TOPICS.map((item) => (
              <option key={item.value} value={item.value}>{item.label}</option>
            ))}
          </select>
          <label htmlFor="support-text" style={{ display: "block", marginBottom: 6 }}>
            Опишите проблему
          </label>
          <textarea
            id="support-text"
            className="input"
            value={caseText}
            maxLength={2000}
            rows={4}
            disabled={createCase.isPending}
            onChange={(event) => setCaseText(event.target.value)}
            placeholder="Что произошло и какой результат вы ожидаете?"
            style={{ width: "100%", resize: "vertical", marginBottom: 10 }}
          />
          {createCase.isError && (
            <p role="alert" style={{ color: "var(--danger)" }}>
              Не удалось отправить обращение. Проверьте связь и попробуйте ещё раз.
            </p>
          )}
          <Button
            loading={createCase.isPending}
            disabled={!canSubmit}
            onClick={() => {
              if (!caseTopic || !canSubmit) return;
              createCase.mutate({ topic: caseTopic, text: trimmedText });
            }}
          >
            Отправить обращение
          </Button>
        </section>

        <section role="region" aria-label="Мои обращения" style={{ marginBottom: 20 }}>
          <h2 className="h2">Мои обращения</h2>
          {cases.isLoading && <div className="card muted">Загружаем обращения…</div>}
          {cases.isError && (
            <div className="card" role="alert">
              <p className="muted">Не удалось загрузить обращения.</p>
              <Button
                variant="secondary"
                onClick={async () => {
                  await cases.refetch();
                }}
              >
                Повторить
              </Button>
            </div>
          )}
          {!cases.isLoading && !cases.isError && (cases.data?.length ?? 0) === 0 && (
            <div className="card muted">Обращений пока нет</div>
          )}
          <div className="stack">
            {(cases.data ?? []).map((item) => (
              <article key={item.id} className="card">
                <div className="row" style={{ alignItems: "flex-start" }}>
                  <b>{item.number}</b>
                  <span className="spacer" />
                  <span className="tag">{STATUS_LABEL[item.status]}</span>
                </div>
                <div style={{ marginTop: 8 }}>{item.text}</div>
                {item.adminReply && (
                  <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--border)" }}>
                    <b>Ответ поддержки</b>
                    <div className="muted" style={{ marginTop: 4 }}>{item.adminReply}</div>
                  </div>
                )}
              </article>
            ))}
          </div>
        </section>

        <div className="help-topics">
          <button className="card help-topic" onClick={() => nav("/matches")}>
            <IconCalendar /><b>Смена и выход</b><small>Код прихода, отмена, спор</small>
          </button>
          <button
            className="card help-topic"
            aria-pressed={faqTopic === "money"}
            onClick={() => setFaqTopic(faqTopic === "money" ? "all" : "money")}
          >
            <IconMoney /><b>Оплата</b><small>Комиссия и расчёты</small>
          </button>
          <button className="card help-topic" onClick={() => nav("/settings")}>
            <IconShield /><b>Профиль и данные</b><small>Настройки и документы</small>
          </button>
          <button
            className="card help-topic"
            aria-pressed={faqTopic === "all"}
            onClick={() => setFaqTopic("all")}
          >
            <IconHelp /><b>Частые вопросы</b><small>Как работает сервис</small>
          </button>
        </div>

        <h2 className="h2">{faqTopic === "money" ? "Про оплату" : "Ответы на вопросы"}</h2>
        {faqTopic !== "all" && (
          <Button variant="ghost" onClick={() => setFaqTopic("all")}>Все вопросы</Button>
        )}
        <div className="stagger" style={{ display: "grid", gap: 10, marginBottom: 20 }}>
          {FAQ.filter((_, index) => faqTopic !== "money" || [4, 5, 6].includes(index)).map((item) => (
            <FaqItem key={item.q} q={item.q} a={item.a} />
          ))}
        </div>

        <a
          className="ui-btn ui-btn--secondary"
          href={SUPPORT_URL}
          onClick={(event) => {
            event.preventDefault();
            haptic("light");
            openTelegram(SUPPORT_URL);
          }}
          style={{
            width: "100%",
            minHeight: 54,
            padding: "0 20px",
            fontSize: "var(--text-md)",
            color: "var(--text)",
            textDecoration: "none",
          }}
        >
          <IconChat size={18} /> Написать в поддержку в Telegram
        </a>
      </div>
    </div>
  );
}
