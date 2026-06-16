import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { fetchFunnel } from "@/api/endpoints";
import { ErrorBox, Loading } from "@/components/States";
import { showBackButton } from "@/telegram/sdk";

const STEPS: { key: string; label: string }[] = [
  { key: "open", label: "Открыли" },
  { key: "swipe", label: "Свайпнули" },
  { key: "match", label: "Мэтч" },
  { key: "confirm", label: "Подтвердили смену" },
  { key: "purchase", label: "Покупка" },
];

export function FunnelPage() {
  const nav = useNavigate();
  useEffect(() => showBackButton(() => nav(-1)), [nav]);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["funnel"],
    queryFn: fetchFunnel,
  });

  const top = data ? Math.max(data.open ?? 0, 1) : 1;

  return (
    <div className="app">
      <div className="page">
        <h1 className="h1" style={{ marginBottom: 4 }}>Воронка</h1>
        <p className="muted" style={{ marginBottom: 16 }}>
          Путь пользователя: открытие → свайп → мэтч → смена → покупка.
        </p>

        {isLoading && <Loading />}
        {isError && <ErrorBox onRetry={() => refetch()} />}

        {data && (
          <div style={{ display: "grid", gap: 12 }}>
            {STEPS.map((s, i) => {
              const value = data[s.key] ?? 0;
              const width = `${Math.round((value / top) * 100)}%`;
              const prev = i > 0 ? data[STEPS[i - 1].key] ?? 0 : value;
              const conv = prev > 0 ? Math.round((value / prev) * 100) : 100;
              return (
                <div key={s.key} className="card">
                  <div className="row">
                    <b>{s.label}</b>
                    <span className="spacer" />
                    <b>{value.toLocaleString("ru")}</b>
                  </div>
                  <div
                    style={{
                      marginTop: 8,
                      height: 10,
                      borderRadius: 6,
                      background: "var(--border)",
                      overflow: "hidden",
                    }}
                  >
                    <div style={{ width, height: "100%", background: "var(--gold)" }} />
                  </div>
                  {i > 0 && (
                    <div className="muted" style={{ marginTop: 6, fontSize: 12 }}>
                      конверсия из «{STEPS[i - 1].label}»: {conv}%
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
