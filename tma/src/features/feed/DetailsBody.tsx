import type { ReactNode } from "react";
import type { Seeker, Vacancy } from "@/types/domain";
import {
  EXPERIENCE_TAG_LABELS,
  MED_BOOK_LABELS,
  PAY_METHOD_LABELS,
  STAFF_ROLE_LABELS,
  TIPS_LABELS,
} from "@/types/domain";
import {
  dec1,
  distance,
  estimatedPay,
  fmtTime,
  money,
  numRu,
  shiftDayLabel,
} from "@/lib/format";
import {
  IconCalendar,
  IconCheck,
  IconMedBook,
  IconMoney,
  IconPin,
  IconStar,
} from "@/components/Icons";
import { reliabilityText } from "@/lib/reliability";

/** Строка подробностей: значок слева, содержимое справа.
 *
 *  Живёт здесь, а не в двух местах: изнанка карточки и её содержимое — это
 *  один и тот же текст, и разъехаться они не должны. */
function Row({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <div className="row" style={{ gap: 10, alignItems: "flex-start", marginTop: 12 }}>
      <span style={{ color: "var(--gold)", display: "inline-flex", marginTop: 2 }}>{icon}</span>
      <span style={{ flex: 1 }}>{children}</span>
    </div>
  );
}

/** Честная оговорка внизу подробностей — своя у каждой стороны. */
function Note({ children }: { children: ReactNode }) {
  return (
    <div className="card" style={{ marginTop: 16, background: "var(--gold-tint)", borderColor: "var(--gold)" }}>
      <div className="row" style={{ gap: 8 }}>
        <span style={{ color: "var(--gold)", display: "inline-flex" }}><IconCheck size={16} /></span>
        <span className="muted">{children}</span>
      </div>
    </div>
  );
}

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

/** Подробности смены: разбивка оплаты, время пешком, что взять с собой.
 *
 *  Глубина, которой нет у досок вакансий. Показывается на изнанке карточки —
 *  и это ЕДИНСТВЕННОЕ место, где живут адрес, описание и чаевые: с лицевой
 *  стороны они убраны, чтобы решение принималось за три секунды. */
export function ShiftDetailsBody({ v }: { v: Vacancy }) {
  const hours = shiftHours(v);
  const walkMin =
    typeof v.distanceKm === "number" ? Math.max(1, Math.round(v.distanceKm * 12)) : null;

  return (
    <>
      <div className="muted">{STAFF_ROLE_LABELS[v.role]}</div>

      <Row icon={<IconCalendar size={18} />}>
        {shiftDayLabel(v.date)} · {fmtTime(v.startTime)}–{fmtTime(v.endTime)} · {numRu(hours)} ч
      </Row>

      <Row icon={<IconMoney size={18} />}>
        <b>Сколько заплатят</b>
        <div className="muted" style={{ marginTop: 2 }}>
          {v.rateType === "perHour"
            ? `${money(v.rate)}/час × ${numRu(hours)} ч ≈ ${money(estimatedPay(v))}`
            : `${money(v.rate)} за смену`}
          {v.payMethod ? ` · ${PAY_METHOD_LABELS[v.payMethod]}` : ""}
          {v.tips && v.tips !== "none" ? ` · ${TIPS_LABELS[v.tips]}` : ""}
        </div>
      </Row>

      <Row icon={<IconPin size={18} />}>
        {v.address}
        {walkMin !== null && (
          <div className="muted" style={{ marginTop: 2 }}>
            ~{walkMin} мин пешком · {distance(v.distanceKm) || "—"}
          </div>
        )}
      </Row>

      <Row icon={<IconMedBook size={18} />}>
        <b>Что взять с собой</b>
        <div className="muted" style={{ marginTop: 2 }}>{whatToBring(v).join(" · ")}</div>
      </Row>

      {v.description && (
        <div className="muted" style={{ marginTop: 14, lineHeight: 1.5 }}>{v.description}</div>
      )}

      <Note>Заведение платит вам напрямую. Просят деньги вперёд — это обман.</Note>
    </>
  );
}

/** Подробности человека — то же самое с другой стороны.
 *
 *  Рассказ о себе и перечень умений живут ТОЛЬКО здесь: с карточки они убраны,
 *  там осталось то, чем выбирают за три секунды. */
export function CandidateDetailsBody({ s }: { s: Seeker }) {
  const roles = s.roles ?? [];
  const tags = s.experienceTags ?? [];

  return (
    <>
      {roles.length > 0 && (
        <div className="muted">{roles.map((r) => STAFF_ROLE_LABELS[r]).join(" · ")}</div>
      )}

      {/* Надёжность — первое, что хочет знать заведение: выйдет человек или
          нет. Поэтому она выше умений и рассказа о себе. */}
      <Row icon={<IconCheck size={18} />}>
        <b>Можно ли положиться</b>
        <div className="muted" style={{ marginTop: 2 }}>
          {s.shiftsTotal
            ? reliabilityText(s.shiftsTotal, s.shiftsAttended, s.employersTotal)
            : "Смен на площадке пока не было"}
        </div>
      </Row>

      {/* Прочерк вместо оценки читается как «ноль»: у человека без отзывов
          звезду просто не показываем, как и на карточке. */}
      {!!s.rating && <Row icon={<IconStar size={18} />}>{dec1(s.rating)}</Row>}

      {s.district && <Row icon={<IconPin size={18} />}>{s.district}</Row>}

      <Row icon={<IconMedBook size={18} />}>
        <b>Медкнижка</b>
        <div className="muted" style={{ marginTop: 2 }}>
          {MED_BOOK_LABELS[s.medBook]}
          {s.selfEmployed ? " · Самозанятый" : ""}
        </div>
      </Row>

      {tags.length > 0 && (
        <Row icon={<IconCheck size={18} />}>
          <b>Что умеет</b>
          <div className="muted" style={{ marginTop: 2 }}>
            {tags.map((t) => EXPERIENCE_TAG_LABELS[t]).join(" · ")}
          </div>
        </Row>
      )}

      {s.about && (
        <div className="muted" style={{ marginTop: 14, lineHeight: 1.5 }}>{s.about}</div>
      )}

      {/* Честная оговорка вместо ложной уверенности: документы мы не храним и
          не проверяем принципиально (152-ФЗ). Всё, что здесь про медкнижку и
          опыт, человек указал сам, и заведение должно знать это до смены. */}
      <Note>
        Медкнижку и опыт человек указывает сам — документы мы не храним.
        Попросите показать их на смене.
      </Note>
    </>
  );
}
