import type { Seeker, Vacancy } from "@/types/domain";
import {
  EXPERIENCE_TAG_LABELS,
  MED_BOOK_LABELS,
  PAY_METHOD_SHORT,
  STAFF_ROLE_LABELS,
} from "@/types/domain";
import {
  estimatedPay,
  fmtTime,
  isUrgentShift,
  rateLabel,
  shiftDayLabel,
} from "@/lib/format";

export function VacancyCardContent({ v }: { v: Vacancy }) {
  const urgent = isUrgentShift(v.date);
  const payShort = v.payMethod ? PAY_METHOD_SHORT[v.payMethod] : null;
  return (
    <>
      <div
        className="swipe-photo"
        style={{ backgroundImage: `url(${v.interiorPhotoUrl})` }}
      />
      <div className="swipe-shade" />
      <div className="row" style={{ position: "absolute", top: 16, left: 16, right: 16 }}>
        <span className="glass">💰 {rateLabel(v.rate, v.rateType)}</span>
        <span className="spacer" />
        {urgent && (
          <span className="glass pulse" style={{ background: "rgba(220,38,38,.9)" }}>
            🔥 Сегодня
          </span>
        )}
        {v.boosted && <span className="glass pulse" style={{ background: "rgba(201,162,39,.9)" }}>🔥 ТОП</span>}
        {typeof v.distanceKm === "number" && (
          <span className="glass">📍 {v.distanceKm.toFixed(1)} км</span>
        )}
      </div>
      <div className="swipe-body">
        <div className="row" style={{ marginBottom: 8, flexWrap: "wrap" }}>
          <span className="tag" style={{ background: "var(--gold)", color: "#fff", borderColor: "var(--gold)" }}>
            {STAFF_ROLE_LABELS[v.role]}
          </span>
          {v.employerVerified && (
            <span className="tag" style={{ background: "rgba(59,130,246,.18)", color: "#bcd6ff", borderColor: "#3b82f6" }}>
              ✓ Проверен
            </span>
          )}
          {v.employerPaysOnTime && (
            <span className="tag" style={{ background: "rgba(34,197,94,.18)", color: "#bbf7d0", borderColor: "#22c55e" }}>
              ✓ Платит вовремя
            </span>
          )}
        </div>
        <div style={{ fontSize: 26, fontWeight: 800 }}>{v.companyName}</div>
        <div style={{ opacity: 0.85, marginTop: 4 }}>
          {shiftDayLabel(v.date)} · {fmtTime(v.startTime)}–{fmtTime(v.endTime)}
        </div>
        <div style={{ opacity: 0.85 }}>📍 {v.address}</div>
        {(v.employerShiftsDone || v.employerRating) ? (
          <div style={{ opacity: 0.85, marginTop: 2 }}>
            {v.employerRating ? `★ ${v.employerRating.toFixed(1)}` : ""}
            {v.employerShiftsDone
              ? `${v.employerRating ? " · " : ""}${v.employerShiftsDone} смен закрыто`
              : ""}
          </div>
        ) : null}
        <div style={{ marginTop: 8, opacity: 0.95 }}>{v.description}</div>
        <div className="row" style={{ marginTop: 10, flexWrap: "wrap" }}>
          {payShort && (
            <span className="tag" style={{ color: "#bbf7d0", borderColor: "#22c55e" }}>{payShort}</span>
          )}
          {v.requireMedBook && (
            <span className="tag" style={{ color: "#ffd28a", borderColor: "#d99a2b" }}>⚕ Медкнижка</span>
          )}
          <span className="tag" style={{ color: "#d7e89a", borderColor: "var(--like)" }}>
            ≈ {estimatedPay(v)} ₽ за смену
          </span>
        </div>
      </div>
    </>
  );
}

export function SeekerCardContent({ s }: { s: Seeker }) {
  const year = s.birthDate ? new Date(s.birthDate).getFullYear() : NaN;
  const age = Number.isFinite(year) ? new Date().getFullYear() - year : null;
  const roles = s.roles ?? [];
  const tags = s.experienceTags ?? [];
  const photos = s.photoUrls ?? [];
  // «Проверенный исполнитель» — действующая медкнижка + подтверждённый опыт.
  const verified = s.medBook === "yes" && tags.includes("experienced");
  return (
    <>
      <div
        className="swipe-photo"
        style={{ backgroundImage: `url(${photos[0] ?? ""})` }}
      />
      <div className="swipe-shade" />
      <div className="row" style={{ position: "absolute", top: 16, left: 16, right: 16 }}>
        <span className="glass">⭐ {s.rating.toFixed(1)}</span>
        {s.availableToday && (
          <span className="glass pulse" style={{ marginLeft: 8, background: "rgba(34,197,94,.9)" }}>
            🟢 Готов сегодня
          </span>
        )}
        <span className="spacer" />
        <span className="glass">{s.district}</span>
      </div>
      <div className="swipe-body">
        <div style={{ fontSize: 26, fontWeight: 800 }}>
          {s.name}{age !== null ? `, ${age}` : ""}
          {verified && (
            <span className="tag" style={{ marginLeft: 8, background: "rgba(34,197,94,.18)", color: "#bbf7d0", borderColor: "#22c55e" }}>
              ✓ Проверенный
            </span>
          )}
          {s.selfEmployed && (
            <span className="tag" style={{ marginLeft: 8, color: "#bcd6ff", borderColor: "#3b82f6" }}>
              самозанятый
            </span>
          )}
        </div>
        <div className="row" style={{ marginTop: 8, flexWrap: "wrap" }}>
          {roles.map((r) => (
            <span key={r} className="tag" style={{ background: "var(--gold)", color: "#fff", borderColor: "var(--gold)" }}>
              {STAFF_ROLE_LABELS[r]}
            </span>
          ))}
        </div>
        {s.about && <div style={{ marginTop: 8, opacity: 0.95 }}>{s.about}</div>}
        <div className="row" style={{ marginTop: 10, flexWrap: "wrap" }}>
          <span className="tag" style={{ color: "#ffd28a", borderColor: "#d99a2b" }}>
            Медкнижка: {MED_BOOK_LABELS[s.medBook]}
          </span>
          {tags.slice(0, 2).map((t) => (
            <span key={t} className="tag" style={{ color: "#fff", borderColor: "rgba(255,255,255,.4)" }}>
              {EXPERIENCE_TAG_LABELS[t]}
            </span>
          ))}
        </div>
      </div>
    </>
  );
}
