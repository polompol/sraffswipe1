import type { ReactNode } from "react";
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
  IconLike,
} from "@/components/Icons";
import { Sheet } from "@/components/Sheet";
import { Button } from "@/components/Button";

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
 *  время пешком, что взять с собой. Открывается кнопкой на карточке.
 *
 *  Откликнуться можно прямо отсюда. Раньше главного действия в шторке не было
 *  вовсе: человек всё прочитал, решил — и должен был закрыть шторку и заново
 *  тянуться к сердцу. Ровно в этот момент решение остывает. */
export function ShiftDetailsSheet({
  v,
  onClose,
  onLike,
}: {
  v: Vacancy;
  onClose: () => void;
  /** Может быть асинхронным: промис уходит в кнопку, и та сама держит себя
   *  заблокированной, пока отклик не отправлен (защита от двойного тапа). */
  onLike?: (v: Vacancy) => void | Promise<void>;
}) {
  const hours = shiftHours(v);
  const walkMin = typeof v.distanceKm === "number" ? Math.max(1, Math.round(v.distanceKm * 12)) : null;

  const Row = ({ icon, children }: { icon: ReactNode; children: ReactNode }) => (
    <div className="row" style={{ gap: 10, alignItems: "flex-start", marginTop: 12 }}>
      <span style={{ color: "var(--gold)", display: "inline-flex", marginTop: 2 }}>{icon}</span>
      <span style={{ flex: 1 }}>{children}</span>
    </div>
  );

  return (
    <Sheet
      title={v.companyName}
      onClose={onClose}
      footer={
        // Главное действие — заливкой и первым; «Закрыть» рядом и тише.
        // Порядок именно такой: большой палец дотягивается до правого края
        // легче, чем до левого, а промах по «Закрыть» ничего не стоит.
        onLike ? (
          <div className="row" style={{ gap: 10 }}>
            {/* block={false} обязателен: по умолчанию кнопка во всю ширину,
                и в ряду две такие просто вылезали за край шторки. */}
            <Button
              variant="secondary"
              block={false}
              style={{ flex: "0 0 auto" }}
              icon={<IconSkip size={16} />}
              onClick={onClose}
            >
              Закрыть
            </Button>
            <Button
              block={false}
              style={{ flex: "1 1 auto", minWidth: 0 }}
              icon={<IconLike size={18} />}
              onClick={() => onLike(v)}
            >
              Откликнуться
            </Button>
          </div>
        ) : (
          <Button variant="secondary" icon={<IconSkip size={16} />} onClick={onClose}>
            Закрыть
          </Button>
        )
      }
    >
      <div className="muted">{STAFF_ROLE_LABELS[v.role]}</div>

      <Row icon={<IconCalendar size={18} />}>
        {shiftDayLabel(v.date)} · {fmtTime(v.startTime)}–{fmtTime(v.endTime)} · {hours} ч
      </Row>

      <Row icon={<IconMoney size={18} />}>
        <b>Сколько заплатят</b>
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

      <div className="card" style={{ marginTop: 16, background: "var(--gold-tint)", borderColor: "var(--gold)" }}>
        <div className="row" style={{ gap: 8 }}>
          <span style={{ color: "var(--gold)", display: "inline-flex" }}><IconCheck size={16} /></span>
          <span className="muted">Заведение платит вам напрямую. Просят деньги вперёд — это обман.</span>
        </div>
      </div>
    </Sheet>
  );
}
