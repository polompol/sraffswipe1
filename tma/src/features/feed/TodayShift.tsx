import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { fetchMatches } from "@/api/endpoints";
import { fmtTime, plural, todayISO } from "@/lib/format";
import { IconCalendar, IconChevronRight } from "@/components/Icons";
import { useSession } from "@/store/session";
import { pickTodayShifts } from "./todayShift";

/**
 * Напоминание о сегодняшней смене — прямо над лентой.
 *
 * В день смены человек открывает приложение и попадает в ленту ЧУЖИХ смен:
 * своя лежит во второй вкладке, и до неё надо догадаться дойти. А в этот день
 * ему нужно ровно одно — во сколько и куда, и код прихода. Заведению — кто
 * сегодня выходит.
 *
 * Показывается только в день смены и только пока она не закрыта: в остальные
 * дни лента остаётся лентой.
 */

export function TodayShift() {
  const nav = useNavigate();
  const role = useSession((s) => s.role);
  const { data } = useQuery({ queryKey: ["matches"], queryFn: fetchMatches });

  const { shifts, next } = pickTodayShifts(data ?? [], todayISO());
  if (!next) return null;
  const when = next.shiftStart != null ? fmtTime(next.shiftStart) : "";

  return (
    <button
      onClick={() => nav("/matches")}
      style={{
        width: "100%",
        display: "flex",
        alignItems: "center",
        gap: 10,
        textAlign: "left",
        marginBottom: 10,
        padding: "12px 14px",
        minHeight: 44,
        borderRadius: "var(--radius-sm)",
        border: "1px solid var(--gold-fill)",
        background: "var(--gold-tint)",
        color: "var(--text)",
        font: "inherit",
        cursor: "pointer",
      }}
    >
      <span style={{ color: "var(--gold)", display: "inline-flex" }}>
        <IconCalendar size={18} />
      </span>
      <span className="grow">
        <b>
          {role === "employer"
            ? shifts.length > 1
              ? `Сегодня к вам выходят ${shifts.length} ${plural(shifts.length, "человек", "человека", "человек")}`
              : "Сегодня к вам выходит человек"
            : "Сегодня ваша смена"}
          {when ? (shifts.length > 1 ? ` · первый в ${when}` : ` · ${when}`) : ""}
        </b>
        <div className="muted" style={{ fontSize: "var(--text-sm)" }}>
          {role === "employer"
            ? "Откройте, чтобы назвать код прихода"
            : `${next.companyName ?? "Заведение"} — здесь код прихода`}
        </div>
      </span>
      <span style={{ color: "var(--muted)", display: "inline-flex" }}>
        <IconChevronRight size={20} />
      </span>
    </button>
  );
}
