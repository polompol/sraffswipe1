import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchMatches, leaveReview } from "@/api/endpoints";
import { baseURL, getToken } from "@/api/client";
import { MATCH_STATUS_LABELS } from "@/types/domain";
import { ErrorBox, SkeletonList } from "@/components/States";
import { Button } from "@/components/Button";
import { EmptyState } from "@/components/EmptyState";
import { haptic } from "@/telegram/sdk";

function ReviewRow({ matchId }: { matchId: string }) {
  const [done, setDone] = useState(false);
  if (done) return <div className="muted" style={{ marginTop: 10 }}>Спасибо за отзыв ★</div>;
  return (
    <div className="row" style={{ marginTop: 12, gap: 6 }}>
      <span className="muted">Оценить смену:</span>
      {[1, 2, 3, 4, 5].map((s) => (
        <button
          key={s}
          aria-label={`${s} звёзд`}
          style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", padding: 0 }}
          onClick={async () => {
            haptic("success");
            try {
              await leaveReview(matchId, s, "");
              setDone(true);
            } catch {
              haptic("error");
            }
          }}
        >
          ⭐
        </button>
      ))}
    </div>
  );
}

export function ShiftsPage() {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["matches"],
    queryFn: fetchMatches,
  });
  const shifts = (data ?? []).filter(
    (m) => m.status === "confirmed" || m.status === "completed",
  );

  function downloadAct(matchId: string) {
    const token = getToken();
    const url = `${baseURL}/matches/${matchId}/act.pdf${token ? `?token=${token}` : ""}`;
    window.open(url, "_blank");
  }

  return (
    <div className="page">
      <h1 className="h1" style={{ marginBottom: 12 }}>Мои смены</h1>

      {isLoading && <SkeletonList />}
      {isError && <ErrorBox onRetry={() => refetch()} />}

      {!isLoading && !isError && shifts.length === 0 && (
        <EmptyState
          icon="📅"
          title="Пока нет смен"
          text="Подтвердите смену в чате после мэтча — она появится здесь с актом."
        />
      )}

      <div className="stagger" style={{ display: "grid", gap: 12 }}>
        {shifts.map((m) => (
          <div key={m.id} className="card">
            <div className="row">
              <b>{m.companyName ?? "Заведение"}</b>
              <span className="spacer" />
              <span className="tag" style={{ color: "var(--like)", borderColor: "var(--like)" }}>
                {MATCH_STATUS_LABELS[m.status]}
              </span>
            </div>
            <div style={{ marginTop: 12 }}>
              <Button variant="secondary" onClick={() => downloadAct(m.id)}>
                📄 Сформировать акт (PDF)
              </Button>
            </div>
            <ReviewRow matchId={m.id} />
          </div>
        ))}
      </div>
    </div>
  );
}
