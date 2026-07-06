import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import type { Vacancy } from "@/types/domain";
import {
  PAY_METHOD_LABELS,
  STAFF_ROLE_LABELS,
  TIPS_LABELS,
} from "@/types/domain";
import { estimatedPay, fmtTime, shiftDayLabel } from "@/lib/format";
import {
  IconMoney,
  IconPin,
  IconCalendar,
  IconMedBook,
  IconCheck,
  IconSkip,
} from "@/components/Icons";

function shiftHours(v: Vacancy): number {
  let m = v.endTime - v.startTime;
  if (m <= 0) m += 1440;
  return Math.round((m / 60) * 10) / 10;
}

function whatToBring(v: Vacancy): string[] {
  const base = ["Паспорт", "Удобная обувь"];
  if (v.requireMedBook) base.push("Медкнижка");
  if (["waiter", "waiter_assistant", "hostess", "administrator", "bartender"].includes(v.role))
    base.push("Опрятный вид, чёрный верх");
  if (["cook", "dishwasher"].includes(v.role)) base.push("Сменная одежда");
  return base;
}

/** «Детали смены» — глубина, которой нет у досок вакансий: разбивка оплаты,
 *  время пешком, что взять с собой. Открывается кнопкой на карточке. */
export function ShiftDetailsSheet({ v, onClose }: { v: Vacancy; onClose: () => void }) {
  const hours = shiftHours(v);
  const walkMin = typeof v.distanceKm === "number" ? Math.max(1, Math.round(v.distanceKm * 12)) : null;

  const Row = ({ icon, children }: { icon: ReactNode; children: ReactNode }) => (
    <div className="row" style={{ gap: 10, alignItems: "flex-start", marginTop: 12 }}>
      <span style={{ color: "var(--gold)", display: "inline-flex", marginTop: 2 }}>{icon}</span>
      <span style={{ flex: 1 }}>{children}</span>
    </div>
  );

  return createPortal(
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(20,14,9,0.5)", display: "flex", alignItems: "flex-end", zIndex: 100 }}
      onClick={onClose}
    >
      <div
        className="fade-up sheet"
        style={{ width: "100%", maxWidth: 520, margin: "0 auto", maxHeight: "90vh", display: "flex", flexDirection: "column", background: "var(--surface)", borderTopLeftRadius: 20, borderTopRightRadius: 20 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet-grab" aria-hidden />
        <div className="sheet-body">
          <h2 className="h2" style={{ marginTop: 0 }}>{v.companyName}</h2>
          <div className="muted">{STAFF_ROLE_LABELS[v.role]}</div>

          <Row icon={<IconCalendar size={18} />}>
            {shiftDayLabel(v.date)} · {fmtTime(v.startTime)}–{fmtTime(v.endTime)} · {hours} ч
          </Row>

          <Row icon={<IconMoney size={18} />}>
            <b>Разбивка оплаты</b>
            <div className="muted" style={{ marginTop: 2 }}>
              {v.rateType === "perHour"
                ? `${v.rate} ₽/час × ${hours} ч ≈ ${estimatedPay(v).toLocaleString("ru-RU")} ₽`
                : `${v.rate.toLocaleString("ru-RU")} ₽ за смену`}
              {v.payMethod ? ` · ${PAY_METHOD_LABELS[v.payMethod]}` : ""}
              {v.tips && v.tips !== "none" ? ` · ${TIPS_LABELS[v.tips]}` : ""}
            </div>
          </Row>

          <Row icon={<IconPin size={18} />}>
            {v.address}
            {walkMin !== null && (
              <div className="muted" style={{ marginTop: 2 }}>
                ~{walkMin} мин пешком · {v.distanceKm?.toFixed(1)} км
              </div>
            )}
          </Row>

          <Row icon={<IconMedBook size={18} />}>
            <b>Что взять с собой</b>
            <div className="muted" style={{ marginTop: 2 }}>
              {whatToBring(v).join(" · ")}
            </div>
          </Row>

          {v.description && (
            <div className="muted" style={{ marginTop: 14, lineHeight: 1.5 }}>{v.description}</div>
          )}

          <div className="card" style={{ marginTop: 16, background: "rgba(165,28,48,.05)", borderColor: "var(--gold)" }}>
            <div className="row" style={{ gap: 8 }}>
              <span style={{ color: "var(--gold)", display: "inline-flex" }}><IconCheck size={16} /></span>
              <span className="muted">Оплату получаете напрямую от заведения. Никаких предоплат — это мошенничество.</span>
            </div>
          </div>
        </div>

        <div className="sheet-foot">
          <button className="btn secondary" onClick={onClose}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
              <IconSkip size={16} /> Закрыть
            </span>
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
