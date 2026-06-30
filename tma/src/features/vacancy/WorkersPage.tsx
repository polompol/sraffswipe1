import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { fetchMyWorkers, inviteWorker } from "@/api/endpoints";
import { showBackButton, haptic } from "@/telegram/sdk";
import { ErrorBox, SkeletonList } from "@/components/States";
import { EmptyState } from "@/components/EmptyState";
import { IconCheck, IconBolt } from "@/components/Icons";
import { toast } from "@/components/Toast";

/** «Мои работники» — кто уже выходил, чтобы позвать снова (постоянство). */
export function WorkersPage() {
  const nav = useNavigate();
  useEffect(() => showBackButton(() => nav(-1)), [nav]);
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["my-workers"],
    queryFn: fetchMyWorkers,
  });
  const [invited, setInvited] = useState<Set<string>>(new Set());

  async function invite(id: string) {
    haptic("success");
    try {
      await inviteWorker(id);
      setInvited((s) => new Set(s).add(id));
      toast("Приглашение отправлено", "success");
    } catch {
      toast("Не удалось пригласить", "error");
    }
  }

  return (
    <div className="app">
      <div className="page">
        <h1 className="h1" style={{ marginBottom: 12 }}>Мои работники</h1>
        {isLoading && <SkeletonList />}
        {isError && <ErrorBox onRetry={() => refetch()} />}
        {!isLoading && !isError && (!data || data.length === 0) && (
          <EmptyState
            icon={<IconCheck size={34} />}
            title="Пока никого"
            text="Здесь появятся те, кто уже выходил на ваши смены — чтобы позвать их снова в один тап."
          />
        )}
        <div className="stagger" style={{ display: "grid", gap: 12 }}>
          {data?.map((w) => (
            <div key={w.id} className="card">
              <div className="row">
                <b style={{ flex: 1 }}>{w.name}</b>
                {w.availableToday && (
                  <span className="tag" style={{ color: "var(--gold)", borderColor: "var(--gold)" }}>
                    <IconBolt size={12} /> готов сегодня
                  </span>
                )}
              </div>
              <div className="muted" style={{ marginTop: 4 }}>
                ★ {w.rating.toFixed(1)}
                {w.shiftsTotal > 0 ? ` · вышел на ${w.shiftsAttended} из ${w.shiftsTotal} смен` : ""}
              </div>
              <button
                className="btn secondary"
                style={{ marginTop: 12, minHeight: 46 }}
                disabled={invited.has(w.id)}
                onClick={() => invite(w.id)}
              >
                {invited.has(w.id) ? "Приглашение отправлено" : "Позвать снова"}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
