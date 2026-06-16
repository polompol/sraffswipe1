import type { Seeker, Vacancy } from "@/types/domain";
import {
  EXPERIENCE_TAG_LABELS,
  MED_BOOK_LABELS,
  STAFF_ROLE_LABELS,
} from "@/types/domain";
import { estimatedPay, fmtDate, fmtTime, rateLabel } from "@/lib/format";

export function VacancyCardContent({ v }: { v: Vacancy }) {
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
        {v.boosted && <span className="glass pulse" style={{ background: "rgba(201,162,39,.9)" }}>🔥 ТОП</span>}
        {typeof v.distanceKm === "number" && (
          <span className="glass">📍 {v.distanceKm.toFixed(1)} км</span>
        )}
      </div>
      <div className="swipe-body">
        <div className="row" style={{ marginBottom: 8 }}>
          <span className="tag" style={{ background: "var(--gold)", color: "#fff", borderColor: "var(--gold)" }}>
            {STAFF_ROLE_LABELS[v.role]}
          </span>
          {v.employerVerified && (
            <span className="tag" style={{ background: "rgba(59,130,246,.18)", color: "#bcd6ff", borderColor: "#3b82f6" }}>
              ✓ Проверен
            </span>
          )}
        </div>
        <div style={{ fontSize: 26, fontWeight: 800 }}>{v.companyName}</div>
        <div style={{ opacity: 0.85, marginTop: 4 }}>
          {fmtDate(v.date)} · {fmtTime(v.startTime)}–{fmtTime(v.endTime)}
        </div>
        <div style={{ opacity: 0.85 }}>📍 {v.address}</div>
        <div style={{ marginTop: 8, opacity: 0.95 }}>{v.description}</div>
        <div className="row" style={{ marginTop: 10, flexWrap: "wrap" }}>
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
  const age = new Date().getFullYear() - new Date(s.birthDate).getFullYear();
  return (
    <>
      <div
        className="swipe-photo"
        style={{ backgroundImage: `url(${s.photoUrls[0] ?? ""})` }}
      />
      <div className="swipe-shade" />
      <div className="row" style={{ position: "absolute", top: 16, left: 16, right: 16 }}>
        <span className="glass">⭐ {s.rating.toFixed(1)}</span>
        <span className="spacer" />
        <span className="glass">{s.district}</span>
      </div>
      <div className="swipe-body">
        <div style={{ fontSize: 26, fontWeight: 800 }}>
          {s.name}, {age}
          {s.selfEmployed && (
            <span className="tag" style={{ marginLeft: 8, color: "#bcd6ff", borderColor: "#3b82f6" }}>
              самозанятый
            </span>
          )}
        </div>
        <div className="row" style={{ marginTop: 8, flexWrap: "wrap" }}>
          {s.roles.map((r) => (
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
          {s.experienceTags.slice(0, 2).map((t) => (
            <span key={t} className="tag" style={{ color: "#fff", borderColor: "rgba(255,255,255,.4)" }}>
              {EXPERIENCE_TAG_LABELS[t]}
            </span>
          ))}
        </div>
      </div>
    </>
  );
}
