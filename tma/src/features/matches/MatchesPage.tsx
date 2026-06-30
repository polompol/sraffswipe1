import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { fetchMatches, markAttendance } from "@/api/endpoints";
import { MATCH_STATUS_LABELS } from "@/types/domain";
import { useSession } from "@/store/session";
import { ErrorBox, SkeletonList } from "@/components/States";
import { EmptyState } from "@/components/EmptyState";
import { IconTabMatches, IconCheck, IconWarning } from "@/components/Icons";
import { toast } from "@/components/Toast";
import { haptic } from "@/telegram/sdk";

export function MatchesPage() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const role = useSession((s) => s.role);
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["matches"],
    queryFn: fetchMatches,
  });

  async function mark(matchId: string, attended: boolean) {
    haptic(attended ? "success" : "warning");
    try {
      await markAttendance(matchId, attended);
      toast(attended ? "Отмечено: вышел" : "Отмечено: не вышел", "success");
      qc.invalidateQueries({ queryKey: ["matches"] });
    } catch {
      toast("Не удалось отметить", "error");
    }
  }

  return (
    <div className="page">
      <h1 className="h1" style={{ marginBottom: 12 }}>Мэтчи</h1>
      {isLoading && <SkeletonList />}
      {isError && <ErrorBox onRetry={() => refetch()} />}
      {data && data.length === 0 && (
        <EmptyState
          icon={<IconTabMatches size={34} active />}
          title="Пока нет мэтчей"
          text="Свайпайте вправо понравившиеся смены — при взаимном лайке откроется чат."
        />
      )}
      <div className="stagger" style={{ display: "grid", gap: 12 }}>
        {data?.map((m) => (
          <div key={m.id} className="card">
            <div
              className="row"
              style={{ gap: 12, cursor: "pointer" }}
              onClick={() => nav(`/chat/${m.id}`)}
            >
              <span
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: 12,
                  flex: "none",
                  backgroundImage: `url(${m.companyPhotoUrl ?? ""})`,
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                  background: m.companyPhotoUrl ? undefined : "var(--border)",
                }}
              />
              <span style={{ flex: 1 }}>
                <div style={{ fontWeight: 700 }}>{m.companyName ?? "Заведение"}</div>
                <div className="muted">{MATCH_STATUS_LABELS[m.status]}</div>
              </span>
              <span style={{ color: "var(--muted)", fontSize: 22 }}>›</span>
            </div>
            {role === "employer" && (m.status === "confirmed" || m.status === "completed") && (
              <div className="row" style={{ gap: 8, marginTop: 12 }}>
                <button
                  className="tag"
                  style={{ cursor: "pointer", color: "var(--super)", borderColor: "var(--super)" }}
                  onClick={() => mark(m.id, true)}
                >
                  <IconCheck size={13} /> Вышел
                </button>
                <button
                  className="tag"
                  style={{ cursor: "pointer", color: "var(--muted)", borderColor: "var(--border)" }}
                  onClick={() => mark(m.id, false)}
                >
                  <IconWarning size={13} /> Не вышел
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
