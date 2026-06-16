import { useState } from "react";
import type { StaffRole } from "@/types/domain";
import { STAFF_ROLE_LABELS } from "@/types/domain";
import type { FeedFilters } from "@/api/endpoints";

const ROLES = Object.keys(STAFF_ROLE_LABELS) as StaffRole[];

/** Нижняя панель фильтров ленты: роль, ставка от, дата. */
export function FilterSheet({
  value,
  onApply,
  onClose,
}: {
  value: FeedFilters;
  onApply: (f: FeedFilters) => void;
  onClose: () => void;
}) {
  const [role, setRole] = useState<string | undefined>(value.role);
  const [minRate, setMinRate] = useState<string>(
    value.min_rate ? String(value.min_rate) : "",
  );
  const [dateFrom, setDateFrom] = useState<string>(value.date_from ?? "");

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(20,14,9,0.5)",
        display: "flex",
        alignItems: "flex-end",
        zIndex: 40,
      }}
      onClick={onClose}
    >
      <div
        className="fade-up"
        style={{
          width: "100%",
          maxWidth: 520,
          margin: "0 auto",
          background: "var(--surface)",
          borderTopLeftRadius: 20,
          borderTopRightRadius: 20,
          padding: 20,
          paddingBottom: "calc(20px + env(safe-area-inset-bottom))",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="h2">Фильтры</h2>

        <label className="muted">Должность</label>
        <div className="row" style={{ flexWrap: "wrap", margin: "8px 0 16px" }}>
          {ROLES.map((r) => {
            const on = role === r;
            return (
              <button
                key={r}
                className="tag"
                style={{
                  cursor: "pointer",
                  background: on ? "var(--gold)" : "transparent",
                  color: on ? "#fff" : "var(--text)",
                  borderColor: on ? "var(--gold)" : "var(--border)",
                }}
                onClick={() => setRole(on ? undefined : r)}
              >
                {STAFF_ROLE_LABELS[r]}
              </button>
            );
          })}
        </div>

        <label className="muted" htmlFor="minrate">Ставка от, ₽</label>
        <input
          id="minrate"
          className="input"
          inputMode="numeric"
          style={{ marginBottom: 12 }}
          placeholder="например, 300"
          value={minRate}
          onChange={(e) => setMinRate(e.target.value)}
        />

        <label className="muted" htmlFor="datefrom">Смены с даты</label>
        <input
          id="datefrom"
          className="input"
          type="date"
          style={{ marginBottom: 16 }}
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
        />

        <div className="row" style={{ gap: 10 }}>
          <button
            className="btn secondary"
            onClick={() => onApply({})}
          >
            Сбросить
          </button>
          <button
            className="btn"
            onClick={() =>
              onApply({
                role,
                min_rate: minRate ? Number(minRate) : undefined,
                date_from: dateFrom || undefined,
              })
            }
          >
            Показать
          </button>
        </div>
      </div>
    </div>
  );
}
