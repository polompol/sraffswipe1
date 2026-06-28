import { useState } from "react";
import type { SwipeDirection, Vacancy } from "@/types/domain";
import { PAY_METHOD_SHORT, STAFF_ROLE_LABELS } from "@/types/domain";
import { fmtTime, isUrgentShift, rateLabel, shiftDayLabel } from "@/lib/format";
import { shareVacancy } from "@/lib/share";
import { toast } from "@/components/Toast";
import { ReportSheet } from "@/components/ReportSheet";

/** Список-вид ленты — альтернатива свайпу для тех, кто любит просматривать. */
export function VacancyList({
  items,
  onAct,
}: {
  items: Vacancy[];
  onAct: (v: Vacancy, dir: SwipeDirection) => void;
}) {
  const [reportId, setReportId] = useState<string | null>(null);
  return (
    <div className="stagger" style={{ display: "grid", gap: 12 }}>
      {items.map((v) => (
        <div key={v.id} className="card fade-up">
          <div className="row" style={{ gap: 12, alignItems: "flex-start" }}>
            <div
              style={{
                width: 64,
                height: 64,
                borderRadius: 14,
                flex: "none",
                backgroundImage: `url(${v.interiorPhotoUrl})`,
                backgroundSize: "cover",
                backgroundPosition: "center",
              }}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="row">
                <b style={{ flex: 1 }}>{v.companyName}</b>
                {isUrgentShift(v.date) && (
                  <span className="tag pulse" style={{ color: "#dc2626", borderColor: "#dc2626" }}>🔥 Сегодня</span>
                )}
                {v.boosted && (
                  <span className="tag pulse" style={{ color: "var(--gold)", borderColor: "var(--gold)" }}>🔥 ТОП</span>
                )}
                <button
                  aria-label="Поделиться сменой"
                  style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, color: "var(--muted)" }}
                  onClick={() => shareVacancy(v)}
                >
                  ↗
                </button>
              </div>
              <div className="muted" style={{ marginTop: 2 }}>
                {STAFF_ROLE_LABELS[v.role]} · {rateLabel(v.rate, v.rateType)}
              </div>
              <div className="muted">
                {shiftDayLabel(v.date)} · {fmtTime(v.startTime)}–{fmtTime(v.endTime)}
                {typeof v.distanceKm === "number" ? ` · ${v.distanceKm.toFixed(1)} км` : ""}
              </div>
              <div className="row" style={{ flexWrap: "wrap", gap: 6, marginTop: 6 }}>
                {v.payMethod && (
                  <span className="tag" style={{ color: "#16a34a", borderColor: "#22c55e", fontSize: 12 }}>
                    {PAY_METHOD_SHORT[v.payMethod]}
                  </span>
                )}
                {v.employerPaysOnTime && (
                  <span className="tag" style={{ color: "#16a34a", borderColor: "#22c55e", fontSize: 12 }}>
                    ✓ Платит вовремя
                  </span>
                )}
                {!!v.employerShiftsDone && (
                  <span className="tag" style={{ color: "var(--muted)", borderColor: "var(--border)", fontSize: 12 }}>
                    {v.employerShiftsDone} смен закрыто
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="row" style={{ gap: 8, marginTop: 12 }}>
            <button
              className="btn secondary"
              style={{ minHeight: 44 }}
              onClick={() => onAct(v, "dislike")}
            >
              Пропустить
            </button>
            <button
              className="btn"
              style={{ minHeight: 44 }}
              onClick={() => {
                onAct(v, "like");
                toast("Отклик отправлен", "success");
              }}
            >
              Откликнуться
            </button>
          </div>
          <button
            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted)", fontSize: 12, marginTop: 8 }}
            onClick={() => setReportId(v.id)}
          >
            ⚠ Пожаловаться на вакансию
          </button>
        </div>
      ))}
      {reportId && (
        <ReportSheet
          targetType="vacancy"
          targetId={reportId}
          onClose={() => setReportId(null)}
        />
      )}
    </div>
  );
}
