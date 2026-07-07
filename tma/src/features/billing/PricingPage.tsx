import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { createStarsInvoice, track } from "@/api/endpoints";
import { payWithStars, showBackButton, haptic } from "@/telegram/sdk";
import { useSession } from "@/store/session";
import { Button } from "@/components/Button";
import { IconFire, IconCheck } from "@/components/Icons";

export function PricingPage() {
  const nav = useNavigate();
  const role = useSession((s) => s.role);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => showBackButton(() => nav(-1)), [nav]);

  async function buyBoost() {
    haptic("medium");
    track("purchase", { sku: "boost_24h", provider: "stars" });
    setStatus("Открываем оплату…");
    try {
      const { link } = await createStarsInvoice("boost_24h");
      const res = await payWithStars(link);
      setStatus(res === "paid" ? "Готово — вакансия в топе!" : `Статус: ${res}`);
    } catch {
      haptic("error");
      setStatus("Не удалось открыть оплату. Попробуйте ещё раз.");
    }
  }

  // Соискателям всё бесплатно — растим эту сторону, трения не добавляем.
  if (role === "seeker") {
    return (
      <div className="app">
        <div className="page" style={{ textAlign: "center" }}>
          <h1 className="h1" style={{ marginTop: 8 }}>Для вас — всё бесплатно</h1>
          <p className="muted" style={{ margin: "8px auto 20px", maxWidth: 320 }}>
            Поиск смен, отклики, чат и акт для самозанятого — без оплаты
            и без ограничений. Навсегда.
          </p>
          <div className="card" style={{ textAlign: "left" }}>
            {[
              "Откликайтесь на сколько угодно смен",
              "Оплату получаете напрямую от заведения",
              "Никаких комиссий и скрытых списаний",
            ].map((t) => (
              <div key={t} className="row" style={{ gap: 10, padding: "6px 0" }}>
                <span style={{ color: "var(--like)", flex: "none" }}>
                  <IconCheck size={18} />
                </span>
                <span>{t}</span>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 20 }}>
            <Button onClick={() => nav("/feed")}>Смотреть смены рядом</Button>
          </div>
        </div>
      </div>
    );
  }

  // Заведению — только комиссия. Публикация бесплатна, платите за результат.
  return (
    <div className="app">
      <div className="page" style={{ textAlign: "center" }}>
        <h1 className="h1" style={{ marginTop: 8 }}>Публикуйте смены бесплатно</h1>
        <p className="muted" style={{ margin: "8px auto 20px", maxWidth: 330 }}>
          Никаких подписок и абонплаты. Платите только тогда, когда человек
          реально вышел на смену.
        </p>

        <div
          className="card"
          style={{
            background: "var(--grad-brand)", color: "#fff", border: "none",
            padding: "22px 18px",
          }}
        >
          <div style={{ fontSize: 44, fontWeight: 900, lineHeight: 1 }}>10%</div>
          <div style={{ opacity: 0.95, marginTop: 6, fontSize: 15 }}>
            комиссия за закрытую смену
          </div>
          <div style={{ opacity: 0.9, marginTop: 10, fontSize: 14 }}>
            Не пришёл человек — 0 ₽. Списывается автоматически с баланса,
            без счетов и напоминаний.
          </div>
        </div>

        <div className="card" style={{ textAlign: "left", marginTop: 14 }}>
          {[
            "Публикация вакансий — без лимита",
            "Отклики и чат с кандидатами",
            "Рейтинг и надёжность каждого человека",
          ].map((t) => (
            <div key={t} className="row" style={{ gap: 10, padding: "6px 0" }}>
              <span style={{ color: "var(--like)", flex: "none" }}>
                <IconCheck size={18} />
              </span>
              <span>{t}</span>
            </div>
          ))}
        </div>

        <div className="card" style={{ marginTop: 14, textAlign: "left" }}>
          <div className="row" style={{ gap: 10 }}>
            <span style={{ color: "var(--gold)", flex: "none" }}>
              <IconFire size={20} />
            </span>
            <span style={{ flex: 1 }}>
              <b>Boost на 24 часа</b>
              <div className="muted" style={{ fontSize: 14 }}>
                Поднять вакансию в топ ленты, если человек нужен срочно.
              </div>
            </span>
          </div>
          <div style={{ marginTop: 12 }}>
            <Button variant="secondary" onClick={buyBoost}>
              Ускорить за 150 ★
            </Button>
          </div>
        </div>

        {status && (
          <div className="card" style={{ marginTop: 16 }}>{status}</div>
        )}
      </div>
    </div>
  );
}
