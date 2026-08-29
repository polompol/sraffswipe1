/** Вкладка «Сегодня»: сводка, ежедневные задачи и разбор жалоб.
 *
 *  Главный экран оператора: сюда он заходит утром и отсюда решает споры.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { AdminOverview } from "@/api/endpoints";
import {
  askAfterShift,
  blockUser,
  blockVacancy,
  fetchAdminReports,
  resolveMatch,
  resolveReport,
  sendShiftReminders,
  sendUnfilledAlerts,
  settleShifts,
  warnReport,
} from "@/api/endpoints";
import { Loading } from "@/components/States";
import { toast } from "@/components/Toast";
import { Button } from "@/components/Button";
import { plural } from "@/lib/format";
import { IconCheck, IconWarning } from "@/components/Icons";
import {
  Section,
  Stat,
  act,
  fmtDate,
  useAdminRefresh,
  useJobRunner,
} from "./shared";
import { DisputeFacts, REASON_LABEL, TARGET_LABEL } from "./DisputeFacts";
import { DisputeChat } from "./DisputeChat";

const DAY = 86400000;
const PERIODS: { id: string; label: string; days: number }[] = [
  { id: "today", label: "Сегодня", days: 1 },
  { id: "week", label: "7 дней", days: 7 },
  { id: "all", label: "Всё время", days: 0 },
];

export function TodayTab({ ov }: { ov: { isLoading: boolean; data?: AdminOverview } }) {
  const [repStatus, setRepStatus] = useState<"open" | "all">("open");
  const [period, setPeriod] = useState("week");
  // Черновики ответов заявителю — по одному на жалобу.
  const [replies, setReplies] = useState<Record<string, string>>({});
  const refresh = useAdminRefresh();
  const { busyJob, runJob } = useJobRunner();

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

  // Ежедневные действия оператора. Раньше каждое жило своей кнопкой в разных
  // концах страницы, и половину из них вообще нельзя было нажать из панели.
  const JOBS = [
    {
      id: "remind",
      title: "Напомнить о сменах на сегодня",
      hint: "Всем, у кого сегодня смена и кто ещё не отметился. В сообщении — кнопка «Я на смене». Повторное нажатие дублей не создаёт.",
      run: () => runJob("remind", sendShiftReminders,
        (n) => `Напоминания отправлены: ${n}`, "Сегодня напоминать некому"),
    },
    {
      id: "unfilled",
      title: "Предупредить о завтрашних сменах без людей",
      hint: "Заведение узнаёт вечером, а не утром в день смены, когда искать уже поздно.",
      run: () => runJob("unfilled", sendUnfilledAlerts,
        (n) => `Предупреждено заведений: ${n}`, "Завтра все смены с людьми"),
    },
    {
      id: "settle",
      title: "Закрыть вчерашние смены и начислить комиссию",
      hint: "Смена считается состоявшейся, если после её окончания никто не нажал «Смена не состоялась». Планировщик делает это сам в 14:00 — кнопка нужна, чтобы не ждать.",
      run: () => runJob("settle", settleShifts,
        (n) => `Закрыто смен: ${n}`, "Закрывать пока нечего"),
    },
    {
      id: "aftershift",
      title: "Спросить про вчерашние смены",
      hint: "«Всё прошло как договаривались?» — обеим сторонам. Единственное предупреждение перед тем, как за смену спишется комиссия. Планировщик шлёт его сам в 9:30.",
      // Подписи от старой механики («закрыто смен», «брошенных смен нет»)
      // остались от прежней задачи и врали оператору: кнопка ничего не
      // закрывает, она рассылает вопрос.
      run: () => runJob("aftershift", askAfterShift,
        (n) => `Спросили по ${n} ${plural(n, "смене", "сменам", "сменам")}`,
        "Вчерашних смен нет — спрашивать не о чем"),
    },
  ];

  async function resolveDispute(
    reportId: string,
    matchId: string,
    outcome: "completed" | "no_show",
  ) {
    const ok = await act(
      async () => {
        await resolveMatch(matchId, outcome);
        await resolveReport(reportId);
      },
      outcome === "completed" ? "Смена засчитана" : "Зафиксирована неявка",
      "Не удалось закрыть спор",
    );
    if (ok) refresh();
  }

  async function resolve(id: string) {
    const reply = (replies[id] ?? "").trim();
    const ok = await act(
      () => resolveReport(id, reply),
      reply ? "Ответ отправлен, жалоба закрыта" : "Жалоба закрыта",
      "Не удалось закрыть жалобу",
    );
    if (!ok) return;
    setReplies((m) => ({ ...m, [id]: "" }));
    refresh();
  }

  async function warn(id: string) {
    let total = 0;
    const ok = await act(
      async () => {
        total = await warnReport(id, (replies[id] ?? "").trim());
      },
      "Предупреждение вынесено",
      "Не удалось вынести предупреждение",
    );
    if (!ok) return;
    toast(`Всего предупреждений у нарушителя: ${total}`, "success");
    setReplies((m) => ({ ...m, [id]: "" }));
    refresh();
  }

  async function blockTarget(type: string, targetId: string) {
    const ok = await act(
      () => (type === "vacancy" ? blockVacancy(targetId) : blockUser(targetId)),
      type === "vacancy" ? "Смена снята с публикации" : "Пользователь заблокирован",
      "Не удалось заблокировать",
    );
    if (ok) refresh();
  }

  return (
    <>
      {ov.isLoading ? (
        <Loading />
      ) : ov.data ? (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 22 }}>
          <Stat label="Люди" value={ov.data.users} />
          <Stat label="Смены в ленте" value={ov.data.activeVacancies} />
          <Stat label="Мэтчи" value={ov.data.matches} />
          <Stat label="Отклики" value={ov.data.likes} />
          <Stat label="Закрытых смен" value={ov.data.completedShifts} />
          <Stat label="Жалобы (откр.)" value={ov.data.openReports} />
        </div>
      ) : null}

      <Section
        title="Каждый день"
        hint="Четыре кнопки, которые держат сервис в порядке. Позже вешаются на крон — см. docs/OPERATIONS.md."
      >
        <div className="stack">
          {JOBS.map((j) => (
            <div key={j.id} className="card">
              <b>{j.title}</b>
              <p className="muted" style={{ margin: "6px 0 10px", fontSize: "var(--text-xs)" }}>
                {j.hint}
              </p>
              <Button
                variant="secondary"
                loading={busyJob === j.id}
                onClick={j.run}
              >
                Выполнить
              </Button>
            </div>
          ))}
        </div>
      </Section>

      <div className="row" style={{ marginBottom: 8 }}>
        <h2 className="h2" style={{ margin: 0 }}>Жалобы и споры</h2>
        <span className="spacer" />
        <button
          className="tag"
          style={{ cursor: "pointer", borderColor: "var(--gold)", color: "var(--gold)" }}
          onClick={() => setRepStatus(repStatus === "open" ? "all" : "open")}
        >
          {repStatus === "open" ? "Открытые" : "Все"}
        </button>
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${PERIODS.length}, minmax(0, 1fr))`,
          gap: 6,
          marginBottom: 10,
        }}
      >
        {PERIODS.map((p) => (
          <button
            key={p.id}
            className="tag"
            style={{
              cursor: "pointer",
              background: period === p.id ? "var(--gold-fill)" : "transparent",
              color: period === p.id ? "var(--on-brand)" : "var(--text)",
              borderColor: period === p.id ? "var(--gold-fill)" : "var(--border-strong)",
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
      <div className="stack">
        {visibleReports.map((r) => (
          <div key={r.id} className="card">
            <div className="row">
              <b>{REASON_LABEL[r.reason] ?? r.reason}</b>
              {r.reason === "scam" && r.text.startsWith("Авто") && (
                <span className="tag" style={{ marginLeft: 8, color: "var(--gold)", borderColor: "var(--gold)" }}>авто</span>
              )}
              <span className="spacer" />
              <span className="muted small">
                {TARGET_LABEL[r.targetType] ?? r.targetType} · {fmtDate(r.createdAt)}
              </span>
            </div>
            <div style={{ fontWeight: 700, margin: "4px 0" }}>{r.targetInfo}</div>
            {r.dispute && <DisputeFacts d={r.dispute} />}
            {/* Сама переписка — по кнопке. Жалобы на «переписку по мэтчу»
                разбирались без единого сообщения перед глазами. */}
            {r.targetType === "match" && <DisputeChat matchId={r.targetId} />}
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
                {/* Кнопки одной ширины в столбик: раньше они были разной
                    длины и в каждой жалобе переносились по-своему. */}
                <div style={{ display: "grid", gap: 8 }}>
                  {r.targetType === "vacancy" && (
                    <Button variant="danger" onClick={() => blockTarget("vacancy", r.targetId)}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                        <IconWarning size={16} /> Снять смену
                      </span>
                    </Button>
                  )}
                  {r.targetType === "user" && (
                    <Button variant="danger" onClick={() => blockTarget("user", r.targetId)}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                        <IconWarning size={16} /> Заблокировать
                      </span>
                    </Button>
                  )}
                  {r.targetType === "match" && (
                    <>
                      <Button onClick={() => resolveDispute(r.id, r.targetId, "completed")}>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                          <IconCheck size={16} /> Засчитать смену
                        </span>
                      </Button>
                      <Button
                        variant="secondary"
                        onClick={() => resolveDispute(r.id, r.targetId, "no_show")}
                      >
                        Зафиксировать неявку
                      </Button>
                    </>
                  )}
                  {r.targetType !== "match" && (
                    <Button variant="secondary" onClick={() => warn(r.id)}>
                      Предупредить
                    </Button>
                  )}
                  <Button variant="ghost" onClick={() => resolve(r.id)}>
                    Закрыть жалобу
                  </Button>
                </div>
              </div>
            ) : (
              <div className="muted" style={{ marginTop: 6, fontSize: "var(--text-xs)" }}>✓ Закрыта</div>
            )}
          </div>
        ))}
      </div>
    </>
  );
}
