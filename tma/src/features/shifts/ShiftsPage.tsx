import { useQuery } from "@tanstack/react-query";
import { fetchMatches } from "@/api/endpoints";
import { baseURL, getToken } from "@/api/client";
import { MATCH_STATUS_LABELS } from "@/types/domain";
import { ErrorBox, SkeletonList } from "@/components/States";
import { Button } from "@/components/Button";
import { EmptyState } from "@/components/EmptyState";
import { ReviewStars } from "@/components/ReviewStars";
import { IconCalendar, IconDoc } from "@/components/Icons";

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
          icon={<IconCalendar size={34} />}
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
                <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                  <IconDoc size={17} /> Сформировать акт (PDF)
                </span>
              </Button>
            </div>
            <ReviewStars matchId={m.id} />
          </div>
        ))}
      </div>
    </div>
  );
}
