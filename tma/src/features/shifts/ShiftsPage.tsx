import { useQuery } from "@tanstack/react-query";
import { fetchMatches } from "@/api/endpoints";
import { baseURL, getToken } from "@/api/client";
import { MATCH_STATUS_LABELS } from "@/types/domain";

export function ShiftsPage() {
  const { data } = useQuery({ queryKey: ["matches"], queryFn: fetchMatches });
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

      {shifts.length === 0 && (
        <div className="card" style={{ textAlign: "center", padding: 40 }}>
          <div style={{ fontSize: 56 }}>📅</div>
          <p className="muted" style={{ marginTop: 8 }}>
            Нет подтверждённых смен. Подтвердите смену в чате после мэтча.
          </p>
        </div>
      )}

      <div style={{ display: "grid", gap: 12 }}>
        {shifts.map((m) => (
          <div key={m.id} className="card">
            <div className="row">
              <b>{m.companyName ?? "Заведение"}</b>
              <span className="spacer" />
              <span className="tag" style={{ color: "var(--like)", borderColor: "var(--like)" }}>
                {MATCH_STATUS_LABELS[m.status]}
              </span>
            </div>
            <button className="btn secondary" style={{ marginTop: 12 }} onClick={() => downloadAct(m.id)}>
              📄 Сформировать акт (PDF)
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
