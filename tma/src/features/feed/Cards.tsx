import { useState } from "react";
import type { PayMethod, Seeker, Vacancy } from "@/types/domain";
import {
  EXPERIENCE_TAG_LABELS,
  MED_BOOK_LABELS,
  PAY_METHOD_LABELS,
  STAFF_ROLE_LABELS,
} from "@/types/domain";
import {
  estimatedPay,
  fmtTime,
  isUrgentShift,
  rateLabel,
  shiftDayLabel,
} from "@/lib/format";
import {
  IconBank,
  IconBolt,
  IconCalendar,
  IconCard,
  IconCash,
  IconCheck,
  IconFire,
  IconMedBook,
  IconMoney,
  IconPin,
} from "@/components/Icons";

const PAY_ICON: Record<PayMethod, typeof IconCash> = {
  cash: IconCash,
  card: IconCard,
  transfer: IconBank,
};

/** Фото карточки: всегда есть бренд-градиент + инициал как фолбэк; поверх —
 *  картинка, которая плавно проявляется при загрузке и НЕ ломает вид, если
 *  ссылка битая (onError) или фото нет. */
function SwipePhoto({ src, initial }: { src?: string; initial: string }) {
  const [state, setState] = useState<"load" | "ok" | "err">(src ? "load" : "err");
  return (
    <div className="swipe-photo swipe-photo-fallback">
      <span className="swipe-initial">{initial}</span>
      {src && state !== "err" && (
        <img
          src={src}
          alt=""
          className="swipe-img"
          style={{ opacity: state === "ok" ? 1 : 0 }}
          onLoad={() => setState("ok")}
          onError={() => setState("err")}
        />
      )}
    </div>
  );
}

/** Золотой бейдж-галочка «проверено» — единый знак доверия (бренд-цвет). */
function VerifiedDot({ size = 20, title }: { size?: number; title: string }) {
  return (
    <span
      title={title}
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: "var(--super)",
        color: "#fff",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        flex: "none",
      }}
    >
      <IconCheck size={size * 0.62} />
    </span>
  );
}

export function VacancyCardContent({ v }: { v: Vacancy }) {
  const urgent = isUrgentShift(v.date);
  const hasPhoto = !!v.interiorPhotoUrl;
  const PayGlyph = v.payMethod ? PAY_ICON[v.payMethod] : null;
  return (
    <>
      <SwipePhoto src={hasPhoto ? v.interiorPhotoUrl : undefined} initial={(v.companyName || "С").charAt(0)} />
      <div className="swipe-shade" />

      {/* верхний ряд: ставка слева, срочность/дистанция справа — без лишнего */}
      <div className="row" style={{ position: "absolute", top: 16, left: 16, right: 16, gap: 8 }}>
        <span className="glass">
          <IconMoney size={14} /> {rateLabel(v.rate, v.rateType)}
        </span>
        <span className="spacer" />
        {urgent ? (
          <span className="glass pulse" style={{ background: "rgba(158,27,50,.92)" }}>
            <IconFire size={13} /> Сегодня
          </span>
        ) : v.boosted ? (
          <span className="glass pulse" style={{ background: "rgba(199,162,75,.92)" }}>
            <IconFire size={13} /> ТОП
          </span>
        ) : null}
        {typeof v.distanceKm === "number" && (
          <span className="glass">
            <IconPin size={13} /> {v.distanceKm.toFixed(1)} км
          </span>
        )}
      </div>

      <div className="swipe-body">
        <div className="row" style={{ marginBottom: 8, gap: 6, flexWrap: "wrap" }}>
          <span className="tag" style={{ background: "var(--gold)", color: "#fff", borderColor: "var(--gold)" }}>
            {STAFF_ROLE_LABELS[v.role]}
          </span>
          {v.employerPaysOnTime && (
            <span className="tag" style={{ color: "var(--super)", borderColor: "var(--super)" }}>
              <IconCheck size={13} /> Платит вовремя
            </span>
          )}
        </div>

        <div style={{ fontSize: 26, fontWeight: 800, display: "flex", alignItems: "center", gap: 8 }}>
          <span>{v.companyName}</span>
          {v.employerVerified && <VerifiedDot title="Проверенное заведение" />}
        </div>

        <div className="card-meta">
          <div>
            <IconCalendar size={15} /> {shiftDayLabel(v.date)} · {fmtTime(v.startTime)}–{fmtTime(v.endTime)}
          </div>
          <div>
            <IconPin size={15} /> {v.address}
          </div>
          {(v.employerShiftsDone || v.employerRating) ? (
            <div>
              ★ {v.employerRating ? v.employerRating.toFixed(1) : "—"}
              {v.employerShiftsDone ? ` · ${v.employerShiftsDone} смен закрыто` : ""}
            </div>
          ) : null}
        </div>

        {v.description && (
          <div style={{ marginTop: 8, opacity: 0.92, fontSize: 14, lineHeight: 1.4 }}>
            {v.description}
          </div>
        )}

        <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
          {PayGlyph && v.payMethod && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "var(--super)", fontWeight: 700 }}>
              <PayGlyph size={16} /> {PAY_METHOD_LABELS[v.payMethod]}
            </span>
          )}
          {v.requireMedBook && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5, opacity: 0.9 }}>
              <IconMedBook size={15} /> Медкнижка
            </span>
          )}
        </div>

        <div style={{ marginTop: 8, fontWeight: 800, fontSize: 16 }}>
          ≈ {estimatedPay(v).toLocaleString("ru-RU")} ₽ за смену
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
  const hasPhoto = !!photos[0];
  // «Проверенный исполнитель» — действующая медкнижка + подтверждённый опыт.
  const verified = s.medBook === "yes" && tags.includes("experienced");
  return (
    <>
      <SwipePhoto src={hasPhoto ? photos[0] : undefined} initial={(s.name || "?").charAt(0)} />
      <div className="swipe-shade" />
      <div className="row" style={{ position: "absolute", top: 16, left: 16, right: 16, gap: 8 }}>
        <span className="glass">★ {s.rating.toFixed(1)}</span>
        {s.availableToday && (
          <span className="glass pulse" style={{ background: "rgba(199,162,75,.92)" }}>
            <IconBolt size={13} /> Готов сегодня
          </span>
        )}
        <span className="spacer" />
        <span className="glass">{s.district}</span>
      </div>
      <div className="swipe-body">
        <div style={{ fontSize: 26, fontWeight: 800, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span>{s.name}{age !== null ? `, ${age}` : ""}</span>
          {verified && <VerifiedDot title="Проверенный исполнитель" />}
          {s.selfEmployed && (
            <span className="tag" style={{ color: "#fff", borderColor: "rgba(255,255,255,.5)" }}>
              самозанятый
            </span>
          )}
        </div>
        <div className="row" style={{ marginTop: 8, gap: 6, flexWrap: "wrap" }}>
          {roles.map((r) => (
            <span key={r} className="tag" style={{ background: "var(--gold)", color: "#fff", borderColor: "var(--gold)" }}>
              {STAFF_ROLE_LABELS[r]}
            </span>
          ))}
        </div>
        {s.about && <div style={{ marginTop: 8, opacity: 0.95 }}>{s.about}</div>}
        <div className="card-meta" style={{ marginTop: 10 }}>
          <div>
            <IconMedBook size={15} /> Медкнижка: {MED_BOOK_LABELS[s.medBook]}
          </div>
          {tags.length > 0 && (
            <div style={{ opacity: 0.9 }}>{tags.slice(0, 3).map((t) => EXPERIENCE_TAG_LABELS[t]).join(" · ")}</div>
          )}
        </div>
      </div>
    </>
  );
}
