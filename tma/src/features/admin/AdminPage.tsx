import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  blockUser,
  blockVacancy,
  fetchAdminOverview,
  fetchAdminReports,
  fetchAdminSubscriptions,
  fetchBlocked,
  resolveReport,
  unblockUser,
  unblockVacancy,
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
  const blocked = useQuery({ queryKey: ["admin-blocked"], queryFn: fetchBlocked });

  function refresh() {
    qc.invalidateQueries({ queryKey: ["admin-reports"] });
    qc.invalidateQueries({ queryKey: ["admin-overview"] });
    qc.invalidateQueries({ queryKey: ["admin-blocked"] });
  }

  async function unblock(type: string, id: string) {
    haptic("success");
    if (type === "vacancy") await unblockVacancy(id);
    else await unblockUser(id);
    toast("Разблокировано", "success");
    refresh();
  }

  async function resolve(id: string) {
    haptic("success");
    await resolveReport(id);
    toast("Жалоба закрыта", "success");
    refresh();
  }

  async function blockTarget(type: string, targetId: string) {
    haptic("success");
    if (type === "vacancy") {
      await blockVacancy(targetId);
      toast("Вакансия снята с публикации", "success");
    } else {
      await blockUser(targetId);
      toast("Пользователь заблокирован", "success");
    }
    refresh();
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
      <div className="row" style={{ marginBottom: 12 }}>
        <h1 className="h1" style={{ margin: 0 }}>Админ-панель</h1>
        <span className="spacer" />
        <button
          className="tab"
          style={{ flex: "none", width: "auto", color: "var(--gold)" }}
          onClick={() => nav("/funnel")}
        >
          📊 Воронка
        </button>
      </div>

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
              {r.reason === "scam" && r.text.startsWith("Авто") && (
                <span className="tag" style={{ marginLeft: 8, color: "var(--gold)", borderColor: "var(--gold)" }}>авто</span>
              )}
              <span className="spacer" />
              <span className="muted" style={{ fontSize: 12 }}>{r.targetType}</span>
            </div>
            <div style={{ fontWeight: 700, margin: "4px 0" }}>{r.targetInfo}</div>
            {r.text && <div className="muted" style={{ margin: "2px 0 6px" }}>{r.text}</div>}
            <div className="row" style={{ gap: 8, marginTop: 8 }}>
              {r.targetType === "vacancy" && (
                <button
                  className="btn"
                  style={{ background: "var(--crimson-dark)" }}
                  onClick={() => blockTarget("vacancy", r.targetId)}
                >
                  🚫 Снять вакансию
                </button>
              )}
              {r.targetType === "user" && (
                <button
                  className="btn"
                  style={{ background: "var(--crimson-dark)" }}
                  onClick={() => blockTarget("user", r.targetId)}
                >
                  🚫 Заблокировать
                </button>
              )}
              <button className="btn ghost" onClick={() => resolve(r.id)}>
                Закрыть жалобу
              </button>
            </div>
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

      {blocked.data && blocked.data.length > 0 && (
        <>
          <h2 className="h2" style={{ margin: "18px 0 8px" }}>Заблокированные</h2>
          <div style={{ display: "grid", gap: 10 }}>
            {blocked.data.map((b) => (
              <div key={`${b.type}-${b.id}`} className="card row">
                <span style={{ flex: 1 }}>
                  <b>{b.info}</b>
                  <div className="muted" style={{ fontSize: 12 }}>
                    {b.type === "vacancy" ? "вакансия" : "пользователь"}
                  </div>
                </span>
                <button
                  className="btn ghost"
                  style={{ width: "auto", padding: "8px 14px" }}
                  onClick={() => unblock(b.type, b.id)}
                >
                  Разблокировать
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
