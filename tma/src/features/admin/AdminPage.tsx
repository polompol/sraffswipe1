import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  adminGrant,
  adminSearchUsers,
  blockUser,
  blockVacancy,
  cancelSubscription,
  fetchAdminOverview,
  fetchAdminReports,
  fetchAdminSubscriptions,
  fetchBlocked,
  fetchRevenue,
  resolveReport,
  unblockUser,
  unblockVacancy,
  warnReport,
} from "@/api/endpoints";
import { showBackButton, haptic } from "@/telegram/sdk";
import { Loading } from "@/components/States";
import { toast } from "@/components/Toast";
import { IconShield, IconMoney, IconCheck, IconWarning } from "@/components/Icons";

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

const DAY = 86400000;
const PERIODS: { id: string; label: string; days: number }[] = [
  { id: "today", label: "Сегодня", days: 1 },
  { id: "week", label: "7 дней", days: 7 },
  { id: "all", label: "Всё время", days: 0 },
];

export function AdminPage() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const [repStatus, setRepStatus] = useState<"open" | "all">("open");
  const [period, setPeriod] = useState("week");
  // Черновики ответов заявителю — по одному на жалобу.
  const [replies, setReplies] = useState<Record<string, string>>({});
  const [userQ, setUserQ] = useState("");
  useEffect(() => showBackButton(() => nav(-1)), [nav]);

  const ov = useQuery({ queryKey: ["admin-overview"], queryFn: fetchAdminOverview });
  const rev = useQuery({ queryKey: ["admin-revenue"], queryFn: fetchRevenue });
  const reports = useQuery({
    queryKey: ["admin-reports", repStatus],
    queryFn: () => fetchAdminReports(repStatus),
  });

  // Фильтр по периоду (по дате жалобы) — видеть новые за день/неделю.
  const periodDays = PERIODS.find((p) => p.id === period)?.days ?? 0;
  const visibleReports = (reports.data ?? []).filter(
    (r) =>
      periodDays === 0 ||
      Date.now() - new Date(r.createdAt).getTime() <= periodDays * DAY,
  );

  const fmtDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleString("ru-RU", {
      day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
    });
  };
  const subs = useQuery({
    queryKey: ["admin-subs"],
    queryFn: fetchAdminSubscriptions,
  });
  const blocked = useQuery({ queryKey: ["admin-blocked"], queryFn: fetchBlocked });
  const users = useQuery({
    queryKey: ["admin-users", userQ],
    queryFn: () => adminSearchUsers(userQ),
  });

  async function grant(id: string, sku: string, label: string) {
    haptic("success");
    await adminGrant(id, sku);
    toast(`Выдано: ${label}`, "success");
    qc.invalidateQueries({ queryKey: ["admin-users"] });
  }

  function refresh() {
    qc.invalidateQueries({ queryKey: ["admin-reports"] });
    qc.invalidateQueries({ queryKey: ["admin-overview"] });
    qc.invalidateQueries({ queryKey: ["admin-blocked"] });
    qc.invalidateQueries({ queryKey: ["admin-revenue"] });
  }

  async function unblock(type: string, id: string) {
    haptic("success");
    if (type === "vacancy") await unblockVacancy(id);
    else await unblockUser(id);
    toast("Разблокировано", "success");
    refresh();
  }

  async function cancelSub(ownerId: string) {
    haptic("success");
    await cancelSubscription(ownerId);
    toast("Подписка отменена (доступ → Free)", "success");
    qc.invalidateQueries({ queryKey: ["admin-subs"] });
    qc.invalidateQueries({ queryKey: ["admin-overview"] });
  }

  async function resolve(id: string) {
    haptic("success");
    const reply = (replies[id] ?? "").trim();
    await resolveReport(id, reply);
    setReplies((m) => ({ ...m, [id]: "" }));
    toast(reply ? "Ответ отправлен, жалоба закрыта" : "Жалоба закрыта", "success");
    refresh();
  }

  async function warn(id: string) {
    haptic("warning");
    const n = await warnReport(id, (replies[id] ?? "").trim());
    setReplies((m) => ({ ...m, [id]: "" }));
    toast(`Предупреждение вынесено (всего: ${n})`, "success");
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
        <div className="card muted row" style={{ justifyContent: "center", gap: 8 }} role="alert">
          <IconShield size={18} /> Доступ только для администратора
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
          Воронка
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

      <h2 className="h2" style={{ marginBottom: 8, display: "flex", alignItems: "center", gap: 8 }}>
        <IconMoney size={20} /> Доход
      </h2>
      {rev.data && (
        <div className="card" style={{ marginBottom: 18 }}>
          <div className="row">
            <span style={{ flex: 1 }}>
              <div className="muted" style={{ fontSize: 12 }}>Оценка дохода в месяц</div>
              <div style={{ fontSize: 24, fontWeight: 900, color: "var(--gold)" }}>
                {rev.data.estMonthlyRub.toLocaleString("ru-RU")} ₽
              </div>
            </span>
            <span style={{ textAlign: "right" }}>
              <div className="muted" style={{ fontSize: 12 }}>Всего получено</div>
              <div style={{ fontWeight: 800 }}>
                {rev.data.totalPaidRub.toLocaleString("ru-RU")} ₽ · {rev.data.totalStars} ★
              </div>
            </span>
          </div>
          <div className="muted" style={{ marginTop: 8, fontSize: 13 }}>
            Активных подписок: <b style={{ color: "var(--text)" }}>Pro {rev.data.activePro}</b>
            {" · "}<b style={{ color: "var(--text)" }}>Business {rev.data.activeBusiness}</b>
          </div>
        </div>
      )}

      <h2 className="h2" style={{ marginBottom: 8 }}>Пользователи</h2>
      <input
        className="input"
        style={{ width: "100%", marginBottom: 10 }}
        placeholder="Поиск: имя / @ник / телефон"
        value={userQ}
        onChange={(e) => setUserQ(e.target.value)}
      />
      <div style={{ display: "grid", gap: 10, marginBottom: 18 }}>
        {users.data?.length === 0 && (
          <div className="card muted" style={{ textAlign: "center" }}>Никого не нашли</div>
        )}
        {users.data?.map((u) => (
          <div key={u.id} className="card">
            <div className="row">
              <span style={{ flex: 1 }}>
                <b>{u.name}</b>
                {u.blocked && (
                  <span className="tag" style={{ marginLeft: 8, color: "var(--crimson)", borderColor: "var(--crimson)" }}>бан</span>
                )}
                <div className="muted" style={{ fontSize: 12 }}>
                  {u.role === "employer" ? "заведение" : "соискатель"}
                  {u.username ? ` · @${u.username}` : ""} · {u.plan.toUpperCase()}
                  {" · "}Boost {u.boostBalance}
                  {u.warnings > 0 ? ` · ⚠ ${u.warnings}` : ""}
                </div>
              </span>
            </div>
            <div className="row" style={{ gap: 8, flexWrap: "wrap", marginTop: 8 }}>
              <button
                className="tag"
                style={{ cursor: "pointer", color: "var(--gold)", borderColor: "var(--gold)" }}
                onClick={() => grant(u.id, "boost_24h", "Boost 24ч")}
              >
                + Boost
              </button>
              {u.role === "employer" && (
                <button
                  className="tag"
                  style={{ cursor: "pointer", color: "var(--gold)", borderColor: "var(--gold)" }}
                  onClick={() => grant(u.id, "sub_pro_month", "Pro на месяц")}
                >
                  + Pro (месяц)
                </button>
              )}
              <button
                className="tag"
                style={{ cursor: "pointer", color: "var(--gold)", borderColor: "var(--gold)" }}
                onClick={() => grant(u.id, "super_5", "5 срочных")}
              >
                + 5 срочных
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="row" style={{ marginBottom: 8 }}>
        <h2 className="h2" style={{ margin: 0 }}>Жалобы</h2>
        <span className="spacer" />
        <button
          className="tag"
          style={{ cursor: "pointer", borderColor: "var(--gold)", color: "var(--gold)" }}
          onClick={() => setRepStatus(repStatus === "open" ? "all" : "open")}
        >
          {repStatus === "open" ? "Открытые" : "Все"}
        </button>
      </div>
      <div className="row" style={{ flexWrap: "wrap", marginBottom: 10 }}>
        {PERIODS.map((p) => (
          <button
            key={p.id}
            className="tag"
            style={{
              cursor: "pointer",
              background: period === p.id ? "var(--crimson)" : "transparent",
              color: period === p.id ? "#fff" : "var(--text)",
              borderColor: period === p.id ? "var(--crimson)" : "var(--border)",
            }}
            onClick={() => setPeriod(p.id)}
          >
            {p.label}
          </button>
        ))}
      </div>
      {reports.isLoading && <Loading />}
      {!reports.isLoading && visibleReports.length === 0 && (
        <div className="card muted row" style={{ justifyContent: "center", gap: 8 }}>
          <IconCheck size={16} /> Жалоб за период нет
        </div>
      )}
      <div style={{ display: "grid", gap: 10, marginBottom: 18 }}>
        {visibleReports.map((r) => (
          <div key={r.id} className="card">
            <div className="row">
              <b>{REASON_LABEL[r.reason] ?? r.reason}</b>
              {r.reason === "scam" && r.text.startsWith("Авто") && (
                <span className="tag" style={{ marginLeft: 8, color: "var(--gold)", borderColor: "var(--gold)" }}>авто</span>
              )}
              <span className="spacer" />
              <span className="muted" style={{ fontSize: 12 }}>
                {r.targetType} · {fmtDate(r.createdAt)}
              </span>
            </div>
            <div style={{ fontWeight: 700, margin: "4px 0" }}>{r.targetInfo}</div>
            {r.text && <div className="muted" style={{ margin: "2px 0 6px" }}>{r.text}</div>}
            {r.status === "open" ? (
              <div style={{ marginTop: 8 }}>
                <input
                  className="input"
                  style={{ width: "100%", marginBottom: 8 }}
                  placeholder="Ответ заявителю / причина предупреждения (необязательно)"
                  value={replies[r.id] ?? ""}
                  onChange={(e) =>
                    setReplies((m) => ({ ...m, [r.id]: e.target.value }))
                  }
                />
                <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                  {r.targetType === "vacancy" && (
                    <button
                      className="btn"
                      style={{ background: "var(--crimson-dark)" }}
                      onClick={() => blockTarget("vacancy", r.targetId)}
                    >
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                        <IconWarning size={16} /> Снять вакансию
                      </span>
                    </button>
                  )}
                  {r.targetType === "user" && (
                    <button
                      className="btn"
                      style={{ background: "var(--crimson-dark)" }}
                      onClick={() => blockTarget("user", r.targetId)}
                    >
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                        <IconWarning size={16} /> Заблокировать
                      </span>
                    </button>
                  )}
                  {r.targetType !== "match" && (
                    <button
                      className="btn secondary"
                      style={{ width: "auto" }}
                      onClick={() => warn(r.id)}
                    >
                      Предупредить
                    </button>
                  )}
                  <button className="btn ghost" onClick={() => resolve(r.id)}>
                    Закрыть жалобу
                  </button>
                </div>
              </div>
            ) : (
              <div className="muted" style={{ marginTop: 6, fontSize: 12 }}>✓ Закрыта</div>
            )}
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
          <div key={s.ownerId} className="card">
            <div className="row">
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
            <button
              className="tab"
              style={{ width: "auto", marginTop: 6, color: "var(--muted)", fontSize: 12 }}
              onClick={() => cancelSub(s.ownerId)}
            >
              Отменить подписку (после возврата денег)
            </button>
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
