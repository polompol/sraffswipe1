import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { PriceItem } from "@/types/domain";
import {
  createStarsInvoice,
  createYookassaPayment,
  track,
} from "@/api/endpoints";
import { payWithStars, showBackButton, haptic } from "@/telegram/sdk";

// Цифровые микро-фичи — Telegram Stars. Подписки/верификация — ЮKassa (рубли).
const SUBSCRIPTIONS: PriceItem[] = [
  { id: "sub_pro_week", title: "Pro · неделя", subtitle: "Безлимит вакансий, фильтры, 3 boost", priceRub: 690 },
  { id: "sub_pro_month", title: "Pro · месяц", subtitle: "Всё из Pro + 10 boost, аналитика", priceRub: 1990, badge: "Хит" },
  { id: "sub_business", title: "Business · месяц", subtitle: "Несколько точек, приоритет, 30 boost", priceRub: 4990 },
];

const STARS: PriceItem[] = [
  { id: "boost_24h", title: "🔥 Boost 24 часа", subtitle: "Вакансия в топе ленты сутки", priceStars: 150 },
  { id: "super_5", title: "⚡ 5 супер-лайков «Срочно»", subtitle: "Ваш отклик — первым", priceStars: 100 },
  { id: "super_20", title: "⚡ 20 супер-лайков", subtitle: "Выгоднее на 25%", priceStars: 300, badge: "−25%" },
  { id: "premium_seeker", title: "⭐ Premium соискателя", subtitle: "«Кто меня лайкнул» + приоритет", priceStars: 250 },
];

const VERIFY: PriceItem = {
  id: "verify_year",
  title: "✓ Верификация заведения",
  subtitle: "Бейдж «Проверен» (DaData) + приоритет, на год",
  priceRub: 2900,
};

export function PricingPage() {
  const nav = useNavigate();
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => showBackButton(() => nav(-1)), [nav]);

  async function buyStars(sku: string) {
    haptic("medium");
    track("purchase", { sku, provider: "stars" });
    setStatus("Открываем оплату Stars…");
    const { link } = await createStarsInvoice(sku);
    const res = await payWithStars(link);
    setStatus(res === "paid" ? "Оплачено ✅" : `Статус: ${res}`);
  }

  async function buyRub(sku: string) {
    haptic("medium");
    track("purchase", { sku, provider: "yookassa" });
    setStatus("Переходим в ЮKassa…");
    const { url } = await createYookassaPayment(sku);
    window.open(url, "_blank");
  }

  return (
    <div className="app">
      <div className="page">
        <h1 className="h1" style={{ marginBottom: 4 }}>Тарифы и буст</h1>
        <p className="muted" style={{ marginBottom: 16 }}>
          Подписки — в рублях через ЮKassa. Boost и супер-лайки — за Telegram Stars.
        </p>

        <h2 className="h2">Подписки для работодателей</h2>
        <div style={{ display: "grid", gap: 12, marginBottom: 24 }}>
          {SUBSCRIPTIONS.map((p) => (
            <PriceRow key={p.id} item={p} onBuy={() => buyRub(p.id)} cta={`${p.priceRub} ₽`} />
          ))}
        </div>

        <h2 className="h2">Boost и супер-лайки</h2>
        <div style={{ display: "grid", gap: 12, marginBottom: 24 }}>
          {STARS.map((p) => (
            <PriceRow key={p.id} item={p} onBuy={() => buyStars(p.id)} cta={`${p.priceStars} ★`} />
          ))}
        </div>

        <h2 className="h2">Доверие</h2>
        <PriceRow item={VERIFY} onBuy={() => buyRub(VERIFY.id)} cta={`${VERIFY.priceRub} ₽`} />

        {status && (
          <div className="card" style={{ marginTop: 16, textAlign: "center" }}>{status}</div>
        )}
      </div>
    </div>
  );
}

function PriceRow({
  item,
  onBuy,
  cta,
}: {
  item: PriceItem;
  onBuy: () => void;
  cta: string;
}) {
  return (
    <div className="card row" style={{ gap: 12 }}>
      <span style={{ flex: 1 }}>
        <div className="row">
          <b>{item.title}</b>
          {item.badge && (
            <span className="tag" style={{ color: "var(--gold)", borderColor: "var(--gold)" }}>{item.badge}</span>
          )}
        </div>
        <div className="muted">{item.subtitle}</div>
      </span>
      <button className="btn" style={{ width: "auto", padding: "10px 16px", whiteSpace: "nowrap" }} onClick={onBuy}>
        {cta}
      </button>
    </div>
  );
}
