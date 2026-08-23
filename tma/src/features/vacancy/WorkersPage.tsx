import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { fetchMyWorkers, inviteWorker } from "@/api/endpoints";
import { showBackButton, haptic } from "@/telegram/sdk";
import { ErrorBox, SkeletonList } from "@/components/States";
import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/Button";
import { IconBriefcase, IconBolt, IconStar } from "@/components/Icons";
import { toast } from "@/components/Toast";
import { reliabilityText } from "@/lib/reliability";
import { apiError } from "@/lib/errors";

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
      const notified = await inviteWorker(id);
      setInvited((s) => new Set(s).add(id));
      toast(
        notified
          ? "Позвали — ждём ответа"
          : "Этого человека вы уже звали — он видит вашу смену",
        "success",
      );
    } catch (e) {
      haptic("error");
      // 409 — нет опубликованной смены: звать некуда, и сервер это объясняет.
      toast(apiError(e, "Не получилось позвать. Попробуйте ещё раз"), "error");
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
            fill
            icon={<IconBriefcase size={34} />}
            title="Пока никого"
            text="Здесь появятся те, кто уже выходил на ваши смены, — позвать снова можно одной кнопкой."
            action={<Button onClick={() => nav("/feed")}>Посмотреть, кто свободен</Button>}
          />
        )}
        <div className="stagger stack stack-lg">
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
                <IconStar size={13} /> {w.rating.toFixed(1)}
                {w.shiftsTotal > 0
                  ? ` · ${reliabilityText(w.shiftsTotal, w.shiftsAttended, w.employersTotal)}`
                  : ""}
              </div>
              {/* minHeight оставлен прежним: в карточке работника кнопка ниже обычной. */}
              <Button
                variant="secondary"
                style={{ marginTop: 12, minHeight: 46 }}
                disabled={invited.has(w.id)}
                onClick={() => invite(w.id)}
              >
                {invited.has(w.id) ? "Позвали" : "Позвать снова"}
              </Button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
