import { useEffect, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  fetchCommissions,
  fetchSources,
  settleCommission,
  writeOffCommission,
  resolveMatch,
  adminCreditWallet,
  adminRefundWallet,
  adminEraseAccount,
  adminLogoutAll,
  fetchCancelStats,
  fetchPayments,
  fetchRepeatPairs,
  sendShiftReminders,
  sendUnfilledAlerts,
  autoCloseShifts,
  closeAbandonedShifts,
  reconcilePayments,
  adminRelink,
  adminSearchUsers,
  blockUser,
  blockVacancy,
  fetchAdminOverview,
  fetchAdminReports,
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
import { Button } from "@/components/Button";
import { plural } from "@/lib/format";
import { apiError } from "@/lib/errors";
import { IconShield, IconCheck, IconWarning } from "@/components/Icons";

const PROVIDER_RU: Record<string, string> = { yookassa: "ЮKassa", manual: "оператор" };
const PAYMENT_STATUS_RU: Record<string, string> = {
  paid: "оплачен",
  pending: "ожидает",
  canceled: "отменён",
  failed: "не прошёл",
};

const REASON_LABEL: Record<string, string> = {
  fake: "Фейк",
  scam: "Мошенничество",
  spam: "Спам",
  abuse: "Абьюз",
  other: "Другое",
};

// Четыре раздела вместо одной простыни на шесть экранов прокрутки. Разбивка
// не по сущностям базы, а по вопросу, с которым оператор сюда пришёл:
// «что горит сегодня», «что с деньгами», «разобраться с человеком»,
// «откуда идут люди».
const TABS = [
  { id: "today", label: "Сегодня" },
  { id: "money", label: "Деньги" },
  { id: "people", label: "Люди" },
  { id: "growth", label: "Рост" },
] as const;

type TabId = (typeof TABS)[number]["id"];

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="card" style={{ textAlign: "center", padding: "14px 8px" }}>
      <div style={{ fontSize: 22, fontWeight: 900, color: "var(--gold)" }}>{value}</div>
      <div className="muted" style={{ fontSize: 12 }}>{label}</div>
    </div>
  );
}

/** Заголовок раздела внутри вкладки. */
function Section({ title, hint, children }: {
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <section style={{ marginBottom: 22 }}>
      <h2 className="h2" style={{ margin: "0 0 6px" }}>{title}</h2>
      {hint && (
        <p className="muted" style={{ margin: "0 0 10px", fontSize: 13 }}>{hint}</p>
      )}
      {children}
    </section>
  );
}

/** Пустое состояние раздела — одинаковое на всю панель. */
function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="card muted" style={{ textAlign: "center" }}>{children}</div>
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
  const [tab, setTab] = useState<TabId>("today");
  const [repStatus, setRepStatus] = useState<"open" | "all">("open");
  const [period, setPeriod] = useState("week");
  // Черновики ответов заявителю — по одному на жалобу.
  const [replies, setReplies] = useState<Record<string, string>>({});
  const [userQ, setUserQ] = useState("");
  useEffect(() => showBackButton(() => nav(-1)), [nav]);

  const ov = useQuery({ queryKey: ["admin-overview"], queryFn: fetchAdminOverview });
  const reports = useQuery({
    queryKey: ["admin-reports", repStatus],
    queryFn: () => fetchAdminReports(repStatus),
    enabled: tab === "today",
  });
  const rev = useQuery({
    queryKey: ["admin-revenue"],
    queryFn: fetchRevenue,
    enabled: tab === "money",
  });
  const comms = useQuery({
    queryKey: ["admin-commissions"],
    queryFn: fetchCommissions,
    enabled: tab === "money",
  });
  const payments = useQuery({
    queryKey: ["admin-payments"],
    queryFn: fetchPayments,
    enabled: tab === "money",
  });
  const users = useQuery({
    queryKey: ["admin-users", userQ],
    queryFn: () => adminSearchUsers(userQ),
    enabled: tab === "people",
  });
  const cancels = useQuery({
    queryKey: ["admin-cancels"],
    queryFn: () => fetchCancelStats(60),
    enabled: tab === "people",
  });
  const blocked = useQuery({
    queryKey: ["admin-blocked"],
    queryFn: fetchBlocked,
    enabled: tab === "people",
  });
  const sources = useQuery({
    queryKey: ["admin-sources"],
    queryFn: fetchSources,
    enabled: tab === "growth",
  });
  const pairs = useQuery({
    queryKey: ["admin-pairs"],
    queryFn: fetchRepeatPairs,
    enabled: tab === "growth",
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

  // Ежедневные действия оператора. Раньше каждое жило своей кнопкой в разных
  // концах страницы, и половину из них вообще нельзя было нажать из панели.
  const [busyJob, setBusyJob] = useState<string | null>(null);
  async function runJob(
    id: string,
    fn: () => Promise<number>,
    done: (n: number) => string,
    none: string,
  ) {
    setBusyJob(id);
    try {
      const n = await fn();
      haptic("success");
      toast(n > 0 ? done(n) : none, "success");
      qc.invalidateQueries({ queryKey: ["admin-overview"] });
    } catch {
      haptic("error");
      toast("Не получилось — попробуйте ещё раз", "error");
    } finally {
      setBusyJob(null);
    }
  }

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
      run: () => runJob("settle", autoCloseShifts,
        (n) => `Закрыто смен: ${n}`, "Закрывать пока нечего"),
    },
    {
      id: "aftershift",
      title: "Спросить про вчерашние смены",
      hint: "«Всё прошло как договаривались?» — обеим сторонам. Единственное предупреждение перед тем, как за смену спишется комиссия. Планировщик шлёт его сам в 9:30.",
      // Подписи от старой механики («закрыто смен», «брошенных смен нет»)
      // остались от прежней задачи и врали оператору: кнопка ничего не
      // закрывает, она рассылает вопрос.
      run: () => runJob("aftershift", closeAbandonedShifts,
        (n) => `Спросили по ${n} ${plural(n, "смене", "сменам", "сменам")}`,
        "Вчерашних смен нет — спрашивать не о чем"),
    },
  ];

  /** Действие оператора: тост при отказе обязателен.
   *
   *  Восемь кнопок панели вызывали сервер без обработки ошибки. Отказ (403,
   *  409, нет сети) не показывал ничего: оператор жал «Заблокировать» по
   *  жалобе на мошенника, экран не менялся — и он считал, что нарушитель
   *  забанен. Хуже неудобства: тихая ошибка выглядит как успех. */
  async function act(fn: () => Promise<unknown>, ok: string, fail: string) {
    try {
      await fn();
      haptic("success");
      toast(ok, "success");
      return true;
    } catch (e) {
      haptic("error");
      toast(apiError(e, fail), "error");
      return false;
    }
  }

  async function credit(id: string, amountRub: number) {
    const ok = await act(
      () => adminCreditWallet(id, amountRub),
      `Баланс пополнен на ${amountRub.toLocaleString("ru-RU")} ₽`,
      "Не удалось пополнить баланс",
    );
    if (ok) qc.invalidateQueries({ queryKey: ["admin-users"] });
  }

  // Возврат с баланса: ошиблись при зачислении или заведение уходит.
  const [refundFor, setRefundFor] = useState<string | null>(null);
  const [refundSum, setRefundSum] = useState("");
  async function refund(id: string) {
    const sum = Number(refundSum.trim());
    if (!sum || sum < 1) {
      toast("Введите сумму возврата", "error");
      return;
    }
    try {
      const left = await adminRefundWallet(id, sum);
      haptic("success");
      toast(`Возвращено ${sum.toLocaleString("ru-RU")} ₽, остаток ${left} ₽`, "success");
      setRefundFor(null);
      setRefundSum("");
      qc.invalidateQueries({ queryKey: ["admin-users"] });
    } catch (e) {
      haptic("error");
      toast(apiError(e, "Не удалось вернуть"), "error");
    }
  }

  // Завершить все сессии: человек потерял телефон. Не блокировка — он просто
  // откроет приложение заново и войдёт сам.
  async function logoutAll(id: string) {
    try {
      await adminLogoutAll(id);
      haptic("success");
      toast("Все сессии завершены", "success");
    } catch {
      haptic("error");
      toast("Не удалось завершить сессии", "error");
    }
  }

  // Удаление данных по заявлению (152-ФЗ). Необратимо, поэтому в два тапа:
  // первый показывает предупреждение, второй выполняет.
  const [eraseFor, setEraseFor] = useState<string | null>(null);
  const [eraseBusy, setEraseBusy] = useState(false);
  async function erase(id: string) {
    setEraseBusy(true);
    try {
      const removed = await adminEraseAccount(id);
      const total = Object.values(removed).reduce((s, n) => s + n, 0);
      haptic("success");
      toast(`Данные удалены, записей затронуто: ${total}`, "success");
      setEraseFor(null);
      qc.invalidateQueries({ queryKey: ["admin-users"] });
    } catch {
      haptic("error");
      toast("Не удалось удалить — попробуйте ещё раз", "error");
    } finally {
      setEraseBusy(false);
    }
  }

  // Перенос аккаунта на новый Telegram: id аккаунта → ввод нового tg_id.
  const [relinkFor, setRelinkFor] = useState<string | null>(null);
  const [relinkTgId, setRelinkTgId] = useState("");
  async function relink(id: string) {
    const tg = Number(relinkTgId.trim());
    if (!tg) {
      toast("Введите числовой Telegram-id (из @userinfobot)", "error");
      return;
    }
    const ok = await act(
      () => adminRelink(id, tg),
      "Аккаунт перенесён на новый Telegram",
      "Не удалось перенести аккаунт",
    );
    if (!ok) return;
    setRelinkFor(null);
    setRelinkTgId("");
    qc.invalidateQueries({ queryKey: ["admin-users"] });
  }

  const commTotal = (comms.data ?? []).reduce((s, c) => s + c.amountRub, 0);
  async function settle(employerId: string) {
    const ok = await act(
      () => settleCommission(employerId),
      "Отмечено оплаченным",
      "Не удалось отметить оплату",
    );
    if (!ok) return;
    qc.invalidateQueries({ queryKey: ["admin-commissions"] });
    qc.invalidateQueries({ queryKey: ["admin-revenue"] });
  }

  // Списание — не то же самое, что оплата: деньги не пришли и не придут.
  // Отдельная кнопка с обязательной причиной, чтобы прощённое не считалось
  // выручкой.
  const [writeOffFor, setWriteOffFor] = useState<string | null>(null);
  const [writeOffWhy, setWriteOffWhy] = useState("");
  async function writeOff(employerId: string) {
    const reason = writeOffWhy.trim();
    if (reason.length < 3) {
      toast("Напишите причину — она останется в истории", "error");
      return;
    }
    try {
      const sum = await writeOffCommission(employerId, reason);
      haptic("warning");
      toast(`Списано ${sum.toLocaleString("ru-RU")} ₽`, "success");
      setWriteOffFor(null);
      setWriteOffWhy("");
      qc.invalidateQueries({ queryKey: ["admin-commissions"] });
      qc.invalidateQueries({ queryKey: ["admin-revenue"] });
    } catch {
      haptic("error");
      toast("Не удалось списать", "error");
    }
  }

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
    if (!ok) return;
    refresh();
    qc.invalidateQueries({ queryKey: ["admin-commissions"] });
  }

  function refresh() {
    qc.invalidateQueries({ queryKey: ["admin-reports"] });
    qc.invalidateQueries({ queryKey: ["admin-overview"] });
    qc.invalidateQueries({ queryKey: ["admin-blocked"] });
    qc.invalidateQueries({ queryKey: ["admin-revenue"] });
  }

  async function unblock(type: string, id: string) {
    const ok = await act(
      () => (type === "vacancy" ? unblockVacancy(id) : unblockUser(id)),
      "Разблокировано",
      "Не удалось разблокировать",
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

  const openCount = ov.data?.openReports ?? 0;

  return (
    <div className="page">
      <h1 className="h1" style={{ margin: "0 0 12px" }}>Админ-панель</h1>

      {/* Вкладки: одна строка, всегда видно, где ты и где горит. */}
      {/* Ряд прокручиваемый, а не сетка в четыре равные доли: на узком
          экране (320px, iPhone SE) четвёртая вкладка не помещалась и
          обрезалась краем экрана — «Рост» был не виден и не нажимался. */}
      <div
        style={{
          display: "flex",
          gap: 6,
          marginBottom: 16,
          overflowX: "auto",
          paddingBottom: 2,
        }}
      >
        {TABS.map((t) => (
          <button
            key={t.id}
            className="tag"
            style={{
              flex: "1 0 auto",
              cursor: "pointer",
              background: tab === t.id ? "var(--gold-fill)" : "transparent",
              color: tab === t.id ? "#fff" : "var(--text)",
              borderColor: tab === t.id ? "var(--gold-fill)" : "var(--border-strong)",
            }}
            aria-current={tab === t.id ? "page" : undefined}
            onClick={() => setTab(t.id)}
          >
            <span style={{ whiteSpace: "nowrap" }}>{t.label}</span>
            {t.id === "today" && openCount > 0 && (
              <span
                aria-label={`открытых жалоб: ${openCount}`}
                style={{
                  minWidth: 18,
                  height: 18,
                  borderRadius: 999,
                  padding: "0 5px",
                  fontSize: 12,
                  fontWeight: 800,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: tab === t.id ? "#fff" : "var(--gold-fill)",
                  color: tab === t.id ? "var(--gold-fill)" : "#fff",
                }}
              >
                {openCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ---------------- Сегодня ---------------- */}
      {tab === "today" && (
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
            <div style={{ display: "grid", gap: 10 }}>
              {JOBS.map((j) => (
                <div key={j.id} className="card">
                  <b>{j.title}</b>
                  <p className="muted" style={{ margin: "6px 0 10px", fontSize: 13 }}>
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
                  color: period === p.id ? "#fff" : "var(--text)",
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
          <div style={{ display: "grid", gap: 10 }}>
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
                    {/* Кнопки одной ширины в столбик: раньше они были разной
                        длины и в каждой жалобе переносились по-своему. */}
                    <div style={{ display: "grid", gap: 8 }}>
                      {r.targetType === "vacancy" && (
                        <Button variant="danger" onClick={() => blockTarget("vacancy", r.targetId)}>
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                            <IconWarning size={16} /> Снять вакансию
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
                  <div className="muted" style={{ marginTop: 6, fontSize: 12 }}>✓ Закрыта</div>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {/* ---------------- Деньги ---------------- */}
      {tab === "money" && (
        <>
          <Section title="Доход">
            {rev.isLoading && <Loading />}
            {rev.data && (
              <div className="card">
                <div className="row">
                  <span style={{ flex: 1 }}>
                    <div className="muted" style={{ fontSize: 12 }}>Комиссия начислена</div>
                    <div style={{ fontSize: 24, fontWeight: 900, color: "var(--gold)" }}>
                      {rev.data.commissionAccruedRub.toLocaleString("ru-RU")} ₽
                    </div>
                  </span>
                  <span style={{ textAlign: "right" }}>
                    <div className="muted" style={{ fontSize: 12 }}>Оплачено</div>
                    <div style={{ fontWeight: 800 }}>
                      {rev.data.commissionPaidRub.toLocaleString("ru-RU")} ₽
                    </div>
                  </span>
                </div>
                <div className="muted" style={{ marginTop: 8, fontSize: 13 }}>
                  К оплате сейчас:{" "}
                  <b style={{ color: "var(--text)" }}>
                    {rev.data.commissionPendingRub.toLocaleString("ru-RU")} ₽
                  </b>
                  {" · "}смен с комиссией:{" "}
                  <b style={{ color: "var(--text)" }}>{rev.data.shiftsBilled}</b>
                </div>
                <div className="muted" style={{ marginTop: 6, fontSize: 13 }}>
                  Списано (прощено и безнадёжное):{" "}
                  <b style={{ color: "var(--text)" }}>
                    {rev.data.commissionWrittenOffRub.toLocaleString("ru-RU")} ₽
                  </b>
                </div>
                <div className="muted" style={{ marginTop: 6, fontSize: 13 }}>
                  Пополнено баланса:{" "}
                  <b style={{ color: "var(--text)" }}>
                    {rev.data.topupsRub.toLocaleString("ru-RU")} ₽
                  </b>{" "}
                  (картой {rev.data.topupsCardRub.toLocaleString("ru-RU")} ₽,
                  зачислено вами {rev.data.topupsManualRub.toLocaleString("ru-RU")} ₽)
                  — это аванс заведений, а не заработок сервиса.
                </div>
              </div>
            )}
          </Section>

          <Section
            title="Комиссия к счёту"
            hint={
              commTotal > 0
                ? `Всего к счёту: ${commTotal.toLocaleString("ru-RU")} ₽ за закрытые смены.`
                : undefined
            }
          >
            {comms.data && comms.data.length === 0 && (
              <Empty>Пока нет закрытых смен к оплате</Empty>
            )}
            <div style={{ display: "grid", gap: 10 }}>
              {(comms.data ?? []).map((c) => (
                <div key={c.employerId} className="card">
                  <div className="row">
                    <span style={{ flex: 1 }}>
                      <b>{c.company}</b>
                      <div className="muted" style={{ fontSize: 12 }}>
                        {c.shifts} {plural(c.shifts, "закрытая смена", "закрытые смены", "закрытых смен")}
                      </div>
                    </span>
                    <span style={{ fontWeight: 900, color: "var(--gold)" }}>
                      {c.amountRub.toLocaleString("ru-RU")} ₽
                    </span>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: 8, marginTop: 10 }}>
                    <button
                      className="tag"
                      style={{ cursor: "pointer", color: "var(--like)", borderColor: "var(--like)" }}
                      onClick={() => settle(c.employerId)}
                    >
                      Деньги пришли
                    </button>
                    <button
                      className="tag"
                      style={{ cursor: "pointer", color: "var(--danger)", borderColor: "var(--danger)" }}
                      onClick={() => {
                        setWriteOffFor(writeOffFor === c.employerId ? null : c.employerId);
                        setWriteOffWhy("");
                      }}
                    >
                      Списать
                    </button>
                  </div>
                  {writeOffFor === c.employerId && (
                    <div className="card" style={{ marginTop: 8, borderColor: "var(--danger)" }}>
                      <p className="muted" style={{ margin: "0 0 8px", fontSize: 13 }}>
                        Списание — это не оплата: денег не будет. Причина
                        останется в истории и в отчёте, чтобы прощённое не
                        считалось выручкой.
                      </p>
                      <input
                        className="input"
                        placeholder="Например: простили после спора"
                        value={writeOffWhy}
                        onChange={(e) => setWriteOffWhy(e.target.value)}
                      />
                      <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
                        <Button variant="danger" onClick={() => writeOff(c.employerId)}>
                          Списать {c.amountRub.toLocaleString("ru-RU")} ₽
                        </Button>
                        <Button variant="ghost" onClick={() => setWriteOffFor(null)}>
                          Отмена
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </Section>

          <Section
            title="Платежи"
            hint="Пополнения баланса картой. Сверка догружает те платежи, по которым не дошёл вебхук ЮKassa: у них деньги есть, у нас их нет."
          >
            <div className="card" style={{ marginBottom: 10 }}>
              <Button
                variant="secondary"
                loading={busyJob === "reconcile"}
                onClick={() => runJob("reconcile", reconcilePayments,
                  (n) => `Дозачислено платежей: ${n}`, "Всё сошлось, дозачислять нечего")}
              >
                Сверить платежи с ЮKassa
              </Button>
            </div>
            {payments.data && payments.data.length === 0 && (
              <Empty>Платежей пока не было</Empty>
            )}
            <div style={{ display: "grid", gap: 8 }}>
              {(payments.data ?? []).map((p) => (
                <div key={p.id} className="card row">
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <b>{p.amount.toLocaleString("ru-RU")} ₽</b>
                    <div className="muted" style={{ fontSize: 12 }}>
                      {fmtDate(p.createdAt)} · {PROVIDER_RU[p.provider] ?? p.provider}
                      {" · "}{PAYMENT_STATUS_RU[p.status] ?? p.status}
                    </div>
                  </span>
                </div>
              ))}
            </div>
          </Section>
        </>
      )}

      {/* ---------------- Люди ---------------- */}
      {tab === "people" && (
        <>
          <Section
            title="Найти человека или заведение"
            hint="Поиск по имени, @нику и телефону. Отсюда же — перенос аккаунта на новый Telegram и удаление данных по заявлению."
          >
            <input
              className="input"
              style={{ width: "100%", marginBottom: 10 }}
              placeholder="Поиск: имя / @ник / телефон"
              value={userQ}
              onChange={(e) => setUserQ(e.target.value)}
            />
            <div style={{ display: "grid", gap: 10 }}>
              {users.data?.length === 0 && <Empty>Никого не нашли</Empty>}
              {users.data?.map((u) => (
                <div key={u.id} className="card">
                  <div className="row">
                    <span style={{ flex: 1 }}>
                      <b>{u.name}</b>
                      {u.blocked && (
                        <span className="tag" style={{ marginLeft: 8, color: "var(--crimson-dark)", borderColor: "var(--crimson-dark)" }}>бан</span>
                      )}
                      <div className="muted" style={{ fontSize: 12 }}>
                        {u.role === "employer" ? "заведение" : "соискатель"}
                        {u.username ? ` · @${u.username}` : ""}
                        {u.role === "employer"
                          ? ` · баланс ${u.balanceRub.toLocaleString("ru-RU")} ₽`
                          : ""}
                        {u.warnings > 0 ? ` · ⚠ ${u.warnings}` : ""}
                      </div>
                    </span>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: 8, marginTop: 10 }}>
                    {u.role === "employer" && (
                      <>
                        {/* Именно Button, а не .tag: зачисление денег не
                            идемпотентно, и двойной тап по подтормаживающему
                            экрану клал на баланс вдвое больше. У Button
                            блокировка на время запроса встроена. */}
                        {[1000, 5000].map((a) => (
                          <Button
                            key={a}
                            size="sm"
                            block={false}
                            variant="secondary"
                            onClick={() => credit(u.id, a)}
                          >
                            Баланс +{a.toLocaleString("ru-RU")} ₽
                          </Button>
                        ))}
                        <button
                          className="tag"
                          style={{ cursor: "pointer" }}
                          onClick={() => {
                            setRefundFor(refundFor === u.id ? null : u.id);
                            setRefundSum("");
                          }}
                        >
                          Вернуть с баланса
                        </button>
                      </>
                    )}
                    <button
                      className="tag"
                      style={{ cursor: "pointer" }}
                      onClick={() => {
                        setRelinkFor(relinkFor === u.id ? null : u.id);
                        setRelinkTgId("");
                      }}
                    >
                      ↔ Новый Telegram
                    </button>
                    <button
                      className="tag"
                      style={{ cursor: "pointer" }}
                      onClick={() => logoutAll(u.id)}
                    >
                      Завершить сессии
                    </button>
                  </div>
                  {/* Необратимое действие стоит отдельно от безобидных: в общем
                      ряду «Удалить данные» слишком легко нажать по инерции. */}
                  <button
                    className="tag"
                    style={{
                      width: "100%",
                      marginTop: 8,
                      cursor: "pointer",
                      color: "var(--danger)",
                      borderColor: "var(--danger)",
                    }}
                    onClick={() => setEraseFor(eraseFor === u.id ? null : u.id)}
                  >
                    Удалить данные по заявлению
                  </button>
                  {refundFor === u.id && (
                    <div className="row" style={{ gap: 8, marginTop: 8 }}>
                      <input
                        className="input"
                        inputMode="numeric"
                        placeholder="Сколько вернуть, ₽"
                        value={refundSum}
                        onChange={(e) => setRefundSum(e.target.value)}
                      />
                      <button
                        className="btn"
                        style={{ width: "auto", padding: "0 14px", height: 46 }}
                        onClick={() => refund(u.id)}
                      >
                        Вернуть
                      </button>
                    </div>
                  )}
                  {eraseFor === u.id && (
                    <div className="card" style={{ marginTop: 8, borderColor: "var(--danger)" }}>
                      <p className="muted" style={{ margin: "0 0 10px", fontSize: 13 }}>
                        Удалить персональные данные по заявлению (152-ФЗ). Из профиля
                        исчезнет всё личное, войти в аккаунт будет нельзя.{" "}
                        <b>Отменить это нельзя.</b> Смены, отзывы и начисленная
                        комиссия останутся — это бухгалтерия.
                      </p>
                      <div style={{ display: "grid", gap: 8 }}>
                        <Button variant="danger" loading={eraseBusy} onClick={() => erase(u.id)}>
                          Да, удалить данные
                        </Button>
                        <Button variant="ghost" onClick={() => setEraseFor(null)}>
                          Отмена
                        </Button>
                      </div>
                    </div>
                  )}
                  {relinkFor === u.id && (
                    <div className="row" style={{ gap: 8, marginTop: 8 }}>
                      <input
                        className="input"
                        inputMode="numeric"
                        placeholder="Новый Telegram-id (@userinfobot)"
                        value={relinkTgId}
                        onChange={(e) => setRelinkTgId(e.target.value)}
                      />
                      <button
                        className="btn"
                        style={{ width: "auto", padding: "0 14px", height: 46 }}
                        onClick={() => relink(u.id)}
                      >
                        Перенести
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </Section>

          <Section
            title="Отмены и неявки"
            hint="За последние 60 дней. Одна отмена — это жизнь. Пять поздних за месяц — уже поведение: сначала позвонить и спросить, потом предупреждение, потом блок."
          >
            {cancels.data && cancels.data.length === 0 && (
              <Empty>Никто никого не подводил — так и должно быть</Empty>
            )}
            <div style={{ display: "grid", gap: 8 }}>
              {(cancels.data ?? []).map((c) => (
                <div key={`${c.ownerId}-${c.role}`} className="card row">
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <b>{c.name}</b>
                    <div className="muted" style={{ fontSize: 12 }}>
                      {c.role === "employer" ? "заведение" : "работник"}
                    </div>
                  </span>
                  <span style={{ textAlign: "right", fontSize: 13 }}>
                    {c.lateCancels > 0 && (
                      <div style={{ color: "var(--danger)", fontWeight: 700 }}>
                        поздних отмен: {c.lateCancels}
                      </div>
                    )}
                    {c.noShows > 0 && (
                      <div style={{ color: "var(--danger)", fontWeight: 700 }}>
                        неявок: {c.noShows}
                      </div>
                    )}
                    <div className="muted">всего отмен: {c.cancels}</div>
                  </span>
                </div>
              ))}
            </div>
          </Section>

          {blocked.data && blocked.data.length > 0 && (
            <Section title="Заблокированные">
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
            </Section>
          )}
        </>
      )}

      {/* ---------------- Рост ---------------- */}
      {tab === "growth" && (
        <>
          <Section
            title="Вернулись за второй сменой"
            hint="Главная цифра экономики: если пары закрывают одну смену и исчезают — значит, дальше договариваются мимо сервиса."
          >
            {pairs.data && pairs.data.length === 0 && (
              <Empty>Повторных пар пока нет</Empty>
            )}
            <div style={{ display: "grid", gap: 10 }}>
              {(pairs.data ?? []).map((p) => (
                <div key={`${p.employer}-${p.worker}`} className="card row">
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <b>{p.employer}</b>
                    <div className="muted" style={{ fontSize: 13 }}>{p.worker}</div>
                  </span>
                  <span className="tag" style={{ color: "var(--gold)", borderColor: "var(--gold)" }}>
                    {p.shifts} {plural(p.shifts, "смена", "смены", "смен")}
                  </span>
                </div>
              ))}
            </div>
          </Section>

          <CampaignLinkMaker />

          <Section title="Источники регистраций">
            {sources.data && sources.data.length === 0 && (
              <Empty>
                Пока нет регистраций по меткам. Давайте ссылки вида{" "}
                <code>t.me/бот?startapp=src_vk</code> — канал появится здесь.
              </Empty>
            )}
            {sources.data && sources.data.length > 0 && (
              <div className="card">
                {sources.data.map((s) => (
                  <div key={s.source} className="row" style={{ padding: "5px 0" }}>
                    <b style={{ flex: 1 }}>{s.source}</b>
                    <span className="muted" style={{ fontSize: 13 }}>
                      работники {s.seekers} · заведения {s.employers}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Section>

          <Section
            title="Воронка"
            hint="Открыл → свайпнул → мэтч → договорились → смена состоялась."
          >
            <Button variant="secondary" onClick={() => nav("/funnel")}>
              Открыть воронку
            </Button>
          </Section>
        </>
      )}
    </div>
  );
}

// Генератор рекламных ссылок: оператор вводит название канала/ролика → готовая
// ссылка t.me/<bot>?startapp=src_XXX для вставки под видео. Клик открытия по
// ней сразу трекается в «Источники регистраций» и ведёт на цепляющий экран.
function CampaignLinkMaker() {
  const bot = import.meta.env.VITE_BOT_USERNAME ?? "staffswipe_bot";
  const [name, setName] = useState("");
  const code = name.trim().toLowerCase().replace(/[^a-z0-9_]+/g, "_").slice(0, 40);
  const link = code ? `https://t.me/${bot}?startapp=src_${code}` : "";

  return (
    <Section
      title="Ссылка для рекламы"
      hint="Впишите канал или ролик (например shorts_waiter) — получите ссылку. Ставьте её под видео: клики соберутся в «Источники» ниже."
    >
      <div className="card">
        <input
          className="input"
          placeholder="например: shorts_waiter"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        {link && (
          <div className="row" style={{ gap: 8, marginTop: 10 }}>
            <code style={{ flex: 1, fontSize: 12, wordBreak: "break-all" }}>{link}</code>
            <button
              className="btn"
              style={{ width: "auto", padding: "0 14px", height: 44 }}
              onClick={() => {
                navigator.clipboard?.writeText(link);
                haptic("success");
                toast("Ссылка скопирована", "success");
              }}
            >
              Копировать
            </button>
          </div>
        )}
      </div>
    </Section>
  );
}
