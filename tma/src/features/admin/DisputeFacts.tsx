/** Карточка спора и словари ярлыков для жалоб.
 *
 *  Оператор читает это на бегу, поэтому и причина, и предмет жалобы
 *  написаны словами, а не служебными кодами из базы.
 */
import type { AdminReport } from "@/api/endpoints";

// На что жалуются. Раньше выводилось служебное слово из базы — оператор
// читал «vacancy» и «match» вместо «Смена» и «Переписка».
export const TARGET_LABEL: Record<string, string> = {
  vacancy: "Смена",
  user: "Человек",
  match: "Переписка",
};

// Причина жалобы — тоже словами, а не кодом из базы.
export const REASON_LABEL: Record<string, string> = {
  fake: "Фейк",
  scam: "Мошенничество",
  spam: "Спам",
  abuse: "Абьюз",
  other: "Другое",
};

/** Факты по спорной смене — то, по чему оператор принимает решение.
 *
 *  Главная строка здесь — про код прихода. Код знает только заведение: если
 *  работник его назвал, значит он был на месте и говорил с людьми, и спор
 *  почти всегда решается этим. Раньше в карточке жалобы было два слова —
 *  «переписка по мэтчу», — а выбирать предлагалось между «засчитать смену» и
 *  «зафиксировать неявку». Вслепую. */
export function DisputeFacts({ d }: { d: NonNullable<AdminReport["dispute"]> }) {
  const rows: [string, string, boolean?][] = [
    ["Работник", d.worker],
    ["Заведение", d.venue],
    ["Смена", d.shiftWhen],
    [
      "Назвал код прихода",
      d.checkedInByCode ? "да — был на месте" : "нет",
      d.checkedInByCode,
    ],
    ["Заведение отметило выход", d.venueMarkedAttended ? "да" : "нет"],
    ...(d.notHeldBy
      ? ([[
          "Заявил «смены не было»",
          d.notHeldBy === "employer" ? "заведение" : "работник",
        ]] as [string, string][])
      : []),
    ["Оплата смены", `${d.payRub.toLocaleString("ru-RU")} ₽`],
    ["Комиссия", d.commission],
  ];
  return (
    <div
      className="card"
      style={{ margin: "8px 0", padding: 12, background: "var(--bg)" }}
    >
      {rows.map(([label, value, strong]) => (
        <div key={label} className="row" style={{ gap: 8, fontSize: "var(--text-xs)" }}>
          <span className="muted" style={{ minWidth: 0, flex: 1 }}>{label}</span>
          <span style={{ fontWeight: strong ? 700 : 600, color: strong ? "var(--like)" : undefined, textAlign: "right" }}>
            {value || "—"}
          </span>
        </div>
      ))}
    </div>
  );
}
