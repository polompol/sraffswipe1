/** Вкладка «Деньги»: выручка, счета к оплате и поступления.
 *
 *  Здесь оператор отмечает оплату комиссии и списывает безнадёжное. Списание
 *  и оплата — разные кнопки намеренно: прощённое не должно считаться
 *  выручкой.
 */
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  fetchCommissions,
  fetchPayments,
  fetchRevenue,
  reconcilePayments,
  settleCommission,
  writeOffCommission,
} from "@/api/endpoints";
import { Loading } from "@/components/States";
import { toast } from "@/components/Toast";
import { Button } from "@/components/Button";
import { plural } from "@/lib/format";
import { haptic } from "@/telegram/sdk";
import { Empty, Section, act, fmtDate, useJobRunner } from "./shared";

const PROVIDER_RU: Record<string, string> = { yookassa: "ЮKassa", manual: "оператор" };
const PAYMENT_STATUS_RU: Record<string, string> = {
  paid: "оплачен",
  pending: "ожидает",
  canceled: "отменён",
  failed: "не прошёл",
};

export function MoneyTab() {
  const qc = useQueryClient();
  const { busyJob, runJob } = useJobRunner();
  // Списание — не то же самое, что оплата: деньги не пришли и не придут.
  // Отдельная кнопка с обязательной причиной, чтобы прощённое не считалось
  // выручкой.
  const [writeOffFor, setWriteOffFor] = useState<string | null>(null);
  const [writeOffWhy, setWriteOffWhy] = useState("");

  const rev = useQuery({ queryKey: ["admin-revenue"], queryFn: fetchRevenue });
  const comms = useQuery({ queryKey: ["admin-commissions"], queryFn: fetchCommissions });
  const payments = useQuery({ queryKey: ["admin-payments"], queryFn: fetchPayments });

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

  return (
    <>
      <Section title="Доход">
        {rev.isLoading && <Loading />}
        {rev.data && (
          <div className="card">
            <div className="row">
              <span style={{ flex: 1 }}>
                <div className="muted small">Комиссия начислена</div>
                <div style={{ fontSize: "var(--text-xl)", fontWeight: 900, color: "var(--gold)" }}>
                  {rev.data.commissionAccruedRub.toLocaleString("ru-RU")} ₽
                </div>
              </span>
              <span style={{ textAlign: "right" }}>
                <div className="muted small">Оплачено</div>
                <div style={{ fontWeight: 800 }}>
                  {rev.data.commissionPaidRub.toLocaleString("ru-RU")} ₽
                </div>
              </span>
            </div>
            <div className="muted" style={{ marginTop: 8, fontSize: "var(--text-xs)" }}>
              К оплате сейчас:{" "}
              <b style={{ color: "var(--text)" }}>
                {rev.data.commissionPendingRub.toLocaleString("ru-RU")} ₽
              </b>
              {" · "}смен с комиссией:{" "}
              <b style={{ color: "var(--text)" }}>{rev.data.shiftsBilled}</b>
            </div>
            <div className="muted" style={{ marginTop: 6, fontSize: "var(--text-xs)" }}>
              Списано (прощено и безнадёжное):{" "}
              <b style={{ color: "var(--text)" }}>
                {rev.data.commissionWrittenOffRub.toLocaleString("ru-RU")} ₽
              </b>
            </div>
            <div className="muted" style={{ marginTop: 6, fontSize: "var(--text-xs)" }}>
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
        <div className="stack">
          {(comms.data ?? []).map((c) => (
            <div key={c.employerId} className="card">
              <div className="row">
                <span style={{ flex: 1 }}>
                  <b>{c.company}</b>
                  <div className="muted small">
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
                  <p className="muted" style={{ margin: "0 0 8px", fontSize: "var(--text-xs)" }}>
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
              <span className="grow">
                <b>{p.amount.toLocaleString("ru-RU")} ₽</b>
                <div className="muted small">
                  {fmtDate(p.createdAt)} · {PROVIDER_RU[p.provider] ?? p.provider}
                  {" · "}{PAYMENT_STATUS_RU[p.status] ?? p.status}
                </div>
              </span>
            </div>
          ))}
        </div>
      </Section>
    </>
  );
}
