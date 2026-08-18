import { useState } from "react";
import {
  ROLE_FAMILIES,
  ROLE_FAMILY_LABELS,
  ROLE_FAMILY_ORDER,
  STAFF_ROLE_LABELS,
} from "@/types/domain";
import type { FeedFilters } from "@/api/endpoints";
import { Sheet } from "@/components/Sheet";
import { haptic } from "@/telegram/sdk";

/** Фильтры ленты кандидатов (сторона заведения): роль, район, «готов сегодня»,
 *  «надёжные без неявок». Зеркалит стиль фильтров соискателя. */
export function CandidateFilterSheet({
  value,
  onApply,
  onClose,
}: {
  value: FeedFilters;
  onApply: (f: FeedFilters) => void;
  onClose: () => void;
}) {
  const [f, setF] = useState<FeedFilters>({ ...value });
  const set = (patch: Partial<FeedFilters>) => setF((cur) => ({ ...cur, ...patch }));

  function Chip({ on, label, onClick }: { on: boolean; label: string; onClick: () => void }) {
    return (
      <button
        className="tag"
        style={{
          cursor: "pointer",
          background: on ? "var(--gold-fill)" : "transparent",
          color: on ? "#fff" : "var(--text)",
          borderColor: on ? "var(--gold-fill)" : "var(--border-strong)",
        }}
        onClick={() => {
          haptic("select");
          onClick();
        }}
      >
        {label}
      </button>
    );
  }

  return (
    <Sheet
      title="Кто нужен"
      onClose={onClose}
      footer={
        <>
          <button className="btn secondary" onClick={() => onApply({})}>
            Сбросить
          </button>
          <button className="btn" onClick={() => onApply(f)}>
            Показать
          </button>
        </>
      }
    >
      <div className="form-label">Должность</div>
      <div style={{ margin: "8px 0 16px" }}>
        {ROLE_FAMILY_ORDER.map((fam) => (
          <div key={fam} style={{ marginBottom: 10 }}>
            <div className="muted" style={{ fontSize: "var(--text-xs)", marginBottom: 6 }}>
              {ROLE_FAMILY_LABELS[fam]}
            </div>
            <div className="row" style={{ flexWrap: "wrap", gap: 8 }}>
              {ROLE_FAMILIES[fam].map((r) => (
                <Chip
                  key={r}
                  on={f.role === r}
                  label={STAFF_ROLE_LABELS[r]}
                  onClick={() => set({ role: f.role === r ? undefined : r })}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      <label className="form-label" htmlFor="district">Район</label>
      <input
        id="district"
        className="input"
        style={{ marginBottom: 16 }}
        placeholder="например, Басманный"
        value={f.district ?? ""}
        onChange={(e) => set({ district: e.target.value || undefined })}
      />

      <div className="form-label">Показать</div>
      <div className="row" style={{ flexWrap: "wrap", margin: "8px 0 18px" }}>
        <Chip
          on={!!f.available_today}
          label="Готов сегодня"
          onClick={() => set({ available_today: !f.available_today })}
        />
        <Chip
          on={!!f.reliable_only}
          label="Надёжные (без неявок)"
          onClick={() => set({ reliable_only: !f.reliable_only })}
        />
      </div>
    </Sheet>
  );
}
