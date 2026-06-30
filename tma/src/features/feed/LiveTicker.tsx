import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchActivity } from "@/api/endpoints";

/** Живая лента «здесь кипит жизнь» — социальное доказательство + FOMO.
 *  Тонкая полоска наверху ленты: пульсирующий статус «онлайн» + бегущие
 *  реальные события (кто только что вышел на смену, сколько ищут сейчас). */
export function LiveTicker() {
  const { data } = useQuery({
    queryKey: ["activity"],
    queryFn: fetchActivity,
    refetchInterval: 30000, // подтягиваем свежесть раз в полминуты
  });
  const [idx, setIdx] = useState(0);

  const items = data?.items ?? [];
  useEffect(() => {
    if (items.length < 2) return;
    const t = setInterval(() => setIdx((i) => (i + 1) % items.length), 3500);
    return () => clearInterval(t);
  }, [items.length]);

  if (!data) return null;
  const current = items[idx % Math.max(1, items.length)];

  return (
    <div
      className="card"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "10px 14px",
        marginBottom: 10,
        background: "rgba(199,162,75,.10)",
        border: "1.5px solid rgba(199,162,75,.55)",
      }}
    >
      <span
        aria-hidden
        className="pulse"
        style={{
          width: 9,
          height: 9,
          borderRadius: "50%",
          background: "var(--super)",
          flex: "none",
          boxShadow: "0 0 0 3px rgba(199,162,75,.22)",
        }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* key={idx} перезапускает мягкую анимацию появления при смене события */}
        <div
          key={idx}
          className="fade-up"
          style={{
            fontSize: 14,
            fontWeight: 700,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {current ? current.text : "Здесь кипит жизнь"}
        </div>
        <div className="muted" style={{ fontSize: 12.5 }}>
          {data.searchingNow} ищут смену рядом сейчас
          {data.urgentToday > 0 ? ` · ${data.urgentToday} срочных сегодня` : ""}
        </div>
      </div>
    </div>
  );
}
