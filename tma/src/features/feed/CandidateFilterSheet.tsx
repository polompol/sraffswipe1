import { useState } from "react";
import { createPortal } from "react-dom";
import {
  ROLE_FAMILIES,
  ROLE_FAMILY_LABELS,
  ROLE_FAMILY_ORDER,
  STAFF_ROLE_LABELS,
} from "@/types/domain";
import type { FeedFilters } from "@/api/endpoints";
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
          background: on ? "var(--gold)" : "transparent",
          color: on ? "#fff" : "var(--text)",
          borderColor: on ? "var(--gold)" : "var(--border)",
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

  return createPortal(
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(20,14,9,0.5)",
        display: "flex",
        alignItems: "flex-end",
        zIndex: 100,
      }}
      onClick={onClose}
    >
      <div
        className="fade-up sheet"
        style={{
          width: "100%",
          maxWidth: 520,
          margin: "0 auto",
          maxHeight: "90vh",
          display: "flex",
          flexDirection: "column",
          background: "var(--surface)",
          borderTopLeftRadius: 20,
          borderTopRightRadius: 20,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet-grab" aria-hidden />
        <div className="sheet-body">
          <h2 className="h2" style={{ marginTop: 0 }}>Кто нужен</h2>

          <label className="muted">Должность</label>
          <div style={{ margin: "8px 0 16px" }}>
            {ROLE_FAMILY_ORDER.map((fam) => (
              <div key={fam} style={{ marginBottom: 10 }}>
                <div className="muted" style={{ fontSize: 12.5, marginBottom: 6 }}>
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

          <label className="muted" htmlFor="district">Район</label>
          <input
            id="district"
            className="input"
            style={{ marginBottom: 16 }}
            placeholder="например, Басманный"
            value={f.district ?? ""}
            onChange={(e) => set({ district: e.target.value || undefined })}
          />

          <label className="muted">Показать</label>
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
        </div>

        <div className="sheet-foot">
          <button className="btn secondary" onClick={() => onApply({})}>
            Сбросить
          </button>
          <button className="btn" onClick={() => onApply(f)}>
            Показать
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
