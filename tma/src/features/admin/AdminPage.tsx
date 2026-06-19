import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  fetchAdminOverview,
  fetchAdminReports,
  fetchAdminSubscriptions,
  resolveReport,
} from "@/api/endpoints";
import { showBackButton, haptic } from "@/telegram/sdk";
import { Loading } from "@/components/States";
import { toast } from "@/components/Toast";

const REASON_LABEL: Record<string, string> = {
  fake: "Фейк",
  scam: "Мошенничество",
  spam: "Спам",
  abuse: "Абьюз",
  other: "Другое",
};

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="card" style={{ textAlign: "center", padding: "14px 8px" }}>
      <div style={{ fontSize: 22, fontWeight: 900, color: "var(--gold)" }}>{value}</div>
      <div className="muted" style={{ fontSize: 12 }}>{label}</div>
    </div>
  );
}

export function AdminPage() {
  const nav = useNavigate();
  const qc = useQueryClient();
  useEffect(() => showBackButton(() => nav(-1)), [nav]);

  const ov = useQuery({ queryKey: ["admin-overview"], queryFn: fetchAdminOverview });
  const reports = useQuery({
    queryKey: ["admin-reports"],
    queryFn: () => fetchAdminReports("open"),
  });
  const subs = useQuery({
    queryKey: ["admin-subs"],
    queryFn: fetchAdminSubscriptions,
  });

  async function resolve(id: string) {
    haptic("success");
    await resolveReport(id);
    toast("Жалоба закрыта", "success");
    qc.invalidateQueries({ queryKey: ["admin-reports"] });
    qc.invalidateQueries({ queryKey: ["admin-overview"] });
  }

  // 403 для не-админа → показываем заглушку.
  if (ov.isError) {
    return (
      <div className="page">
        <h1 className="h1">Админ-панель</h1>
        <div className="card muted" style={{ textAlign: "center" }} role="alert">
          🔒 Доступ только для администратора
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <h1 className="h1" style={{ marginBottom: 12 }}>Админ-панель</h1>

      {ov.isLoading ? (
        <Loading />
      ) : ov.data ? (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 18 }}>
          <Stat label="Пользователи" value={ov.data.users} />
          <Stat label="Активных вакансий" value={ov.data.activeVacancies} />
          <Stat label="Лайки" value={ov.data.likes} />
          <Stat label="Мэтчи" value={ov.data.matches} />
          <Stat label="Жалобы (откр.)" value={ov.data.openReports} />
          <Stat label="Подписки" value={ov.data.activeSubscriptions} />
        </div>
      ) : null}

      <h2 className="h2" style={{ marginBottom: 8 }}>Жалобы</h2>
      {reports.isLoading && <Loading />}
      {reports.data && reports.data.length === 0 && (
        <div className="card muted" style={{ textAlign: "center" }}>Открытых жалоб нет 🎉</div>
      )}
      <div style={{ display: "grid", gap: 10, marginBottom: 18 }}>
        {reports.data?.map((r) => (
          <div key={r.id} className="card">
            <div className="row">
              <b>{REASON_LABEL[r.reason] ?? r.reason}</b>
              <span className="spacer" />
              <span className="muted" style={{ fontSize: 12 }}>
                {r.targetType} · {r.targetId.slice(0, 8)}
              </span>
            </div>
            {r.text && <div className="muted" style={{ margin: "6px 0" }}>{r.text}</div>}
            <button
              className="btn ghost"
              style={{ marginTop: 8 }}
              onClick={() => resolve(r.id)}
            >
              Закрыть жалобу
            </button>
          </div>
        ))}
      </div>

      <h2 className="h2" style={{ marginBottom: 8 }}>Активные подписки</h2>
      {subs.isLoading && <Loading />}
      {subs.data && subs.data.length === 0 && (
        <div className="card muted" style={{ textAlign: "center" }}>Платящих заведений пока нет</div>
      )}
      <div style={{ display: "grid", gap: 10 }}>
        {subs.data?.map((s) => (
          <div key={s.ownerId} className="card row">
            <span style={{ flex: 1 }}>
              <b>{s.company}</b>
              <div className="muted" style={{ fontSize: 12 }}>
                {s.renewsAt ? `до ${s.renewsAt.slice(0, 10)}` : "—"}
              </div>
            </span>
            <span className="tag" style={{ color: "var(--gold)", borderColor: "var(--gold)" }}>
              {s.plan.toUpperCase()}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
