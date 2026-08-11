import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { fetchMatches } from "@/api/endpoints";
import { baseURL, getToken } from "@/api/client";
import { MATCH_STATUS_LABELS } from "@/types/domain";
import { shiftWhen } from "@/lib/format";
import { ErrorBox, SkeletonList } from "@/components/States";
import { Button } from "@/components/Button";
import { EmptyState } from "@/components/EmptyState";
import { ReviewStars } from "@/components/ReviewStars";
import { IconCalendar, IconDoc } from "@/components/Icons";

export function ShiftsPage() {
  const nav = useNavigate();
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
          fill
          icon={<IconCalendar size={34} />}
          title="Пока нет смен"
          text="Подтвердите смену в чате после мэтча — она появится здесь с актом."
          action={<Button onClick={() => nav("/feed")}>Открыть ленту смен</Button>}
        />
      )}

      <div className="stagger" style={{ display: "grid", gap: 12 }}>
        {shifts.map((m) => (
          <div key={m.id} className="card">
            <div className="row" style={{ gap: 8, alignItems: "flex-start" }}>
              <b style={{ flex: 1, minWidth: 0, overflowWrap: "anywhere" }}>
                {m.companyName ?? "Заведение"}
              </b>
              {/* Разный цвет по смыслу: «подтверждена» — впереди, «завершена»
                  — уже отработана. Раньше оба статуса были одинаковыми. */}
              <span
                className="tag"
                style={
                  m.status === "completed"
                    ? { color: "var(--success)", borderColor: "var(--success)" }
                    : { color: "var(--muted)", borderColor: "var(--border-strong)" }
                }
              >
                {MATCH_STATUS_LABELS[m.status]}
              </span>
            </div>
            {/* Когда смена и сколько за неё. В собственном списке смен этих
                двух фактов не было вообще — оставались название заведения и
                кнопка «скачать акт». */}
            {shiftWhen(m) && (
              <div className="muted" style={{ marginTop: 6 }}>{shiftWhen(m)}</div>
            )}
            {!!m.shiftPay && m.shiftPay > 0 && (
              <div style={{ marginTop: 4, fontWeight: 800, fontSize: 17 }}>
                {m.shiftPay.toLocaleString("ru-RU")} ₽
                {m.status === "completed" ? " заработано" : " за смену"}
              </div>
            )}
            <div style={{ marginTop: 12 }}>
              <Button variant="secondary" onClick={() => downloadAct(m.id)}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                  <IconDoc size={17} /> Скачать акт (PDF)
                </span>
              </Button>
            </div>
            {/* Оценку спрашиваем ТОЛЬКО за отработанную смену: у «подтверждена»
                смена ещё впереди, и вопрос «как всё прошло?» сбивал с толку. */}
            {m.status === "completed" && <ReviewStars matchId={m.id} />}
          </div>
        ))}
      </div>
    </div>
  );
}
