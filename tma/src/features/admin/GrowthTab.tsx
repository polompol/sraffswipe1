/** Вкладка «Рост»: откуда приходят люди и возвращаются ли они.
 *
 *  Главная цифра здесь — повторные пары. Если пары закрывают одну смену и
 *  исчезают, значит дальше договариваются мимо сервиса, и никакая реклама
 *  этого не исправит.
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { fetchRepeatPairs, fetchSources } from "@/api/endpoints";
import { toast } from "@/components/Toast";
import { Button } from "@/components/Button";
import { plural } from "@/lib/format";
import { Empty, Section } from "./shared";

export function GrowthTab() {
  const nav = useNavigate();
  const sources = useQuery({ queryKey: ["admin-sources"], queryFn: fetchSources });
  const pairs = useQuery({ queryKey: ["admin-pairs"], queryFn: fetchRepeatPairs });

  return (
    <>
      <Section
        title="Вернулись за второй сменой"
        hint="Главная цифра экономики: если пары закрывают одну смену и исчезают — значит, дальше договариваются мимо сервиса."
      >
        {pairs.data && pairs.data.length === 0 && (
          <Empty>Повторных пар пока нет</Empty>
        )}
        <div className="stack">
          {(pairs.data ?? []).map((p) => (
            <div key={`${p.employer}-${p.worker}`} className="card row">
              <span className="grow">
                <b>{p.employer}</b>
                <div className="muted small">{p.worker}</div>
              </span>
              <span className="tag" style={{ color: "var(--gold)", borderColor: "var(--gold)" }}>
                {p.shifts} {plural(p.shifts, "смена", "смены", "смен")}
              </span>
            </div>
          ))}
        </div>
      </Section>

      <CampaignLinkMaker />

      <Section title="Источники регистраций">
        {sources.data && sources.data.length === 0 && (
          <Empty>
            Пока нет регистраций по меткам. Давайте ссылки вида{" "}
            <code>t.me/бот?startapp=src_vk</code> — канал появится здесь.
          </Empty>
        )}
        {sources.data && sources.data.length > 0 && (
          <div className="card">
            {sources.data.map((s) => (
              <div key={s.source} className="row" style={{ padding: "5px 0" }}>
                <b style={{ flex: 1 }}>{s.source}</b>
                <span className="muted small">
                  работники {s.seekers} · заведения {s.employers}
                </span>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section
        title="Воронка"
        hint="Открыл → свайпнул → мэтч → договорились → смена состоялась."
      >
        <Button variant="secondary" onClick={() => nav("/funnel")}>
          Открыть воронку
        </Button>
      </Section>
    </>
  );
}

// Генератор рекламных ссылок: оператор вводит название канала/ролика → готовая
// ссылка t.me/<bot>?startapp=src_XXX для вставки под видео. Клик открытия по
// ней сразу трекается в «Источники регистраций» и ведёт на цепляющий экран.
function CampaignLinkMaker() {
  const bot = import.meta.env.VITE_BOT_USERNAME ?? "staffswipe_bot";
  const [name, setName] = useState("");
  const code = name.trim().toLowerCase().replace(/[^a-z0-9_]+/g, "_").slice(0, 40);
  const link = code ? `https://t.me/${bot}?startapp=src_${code}` : "";

  return (
    <Section
      title="Ссылка для рекламы"
      hint="Впишите канал или ролик (например shorts_waiter) — получите ссылку. Ставьте её под видео: клики соберутся в «Источники» ниже."
    >
      <div className="card">
        <input
          className="input"
          placeholder="например: shorts_waiter"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        {link && (
          <div className="row" style={{ gap: 8, marginTop: 10 }}>
            <code style={{ flex: 1, fontSize: "var(--text-xs)", wordBreak: "break-all" }}>{link}</code>
            <Button
              block={false}
              style={{ padding: "0 14px", height: 44 }}
              // Вибро здесь своего нет: компонент даёт его сам на нажатие,
              // и два подряд читаются как сбой, а не как отклик.
              onClick={() => {
                navigator.clipboard?.writeText(link);
                toast("Ссылка скопирована", "success");
              }}
            >
              Копировать
            </Button>
          </div>
        )}
      </div>
    </Section>
  );
}
