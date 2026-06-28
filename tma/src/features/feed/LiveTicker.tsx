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
        background: "rgba(34,197,94,.07)",
        border: "1px solid rgba(34,197,94,.35)",
      }}
    >
      <span
        aria-hidden
        className="pulse"
        style={{
          width: 9,
          height: 9,
          borderRadius: "50%",
          background: "#22c55e",
          flex: "none",
          boxShadow: "0 0 0 3px rgba(34,197,94,.2)",
        }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 13,
            fontWeight: 700,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {current ? current.text : "Здесь кипит жизнь"}
        </div>
        <div className="muted" style={{ fontSize: 11.5 }}>
          👀 {data.searchingNow} ищут смену рядом сейчас
          {data.urgentToday > 0 ? ` · 🔥 ${data.urgentToday} срочных на сегодня` : ""}
        </div>
      </div>
    </div>
  );
}
