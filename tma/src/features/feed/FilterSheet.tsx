import { useState } from "react";
import type { StaffRole } from "@/types/domain";
import { STAFF_ROLE_LABELS } from "@/types/domain";
import { createSavedSearch, type FeedFilters } from "@/api/endpoints";
import { haptic } from "@/telegram/sdk";

const ROLES = Object.keys(STAFF_ROLE_LABELS) as StaffRole[];

const SORTS: { id: string; label: string }[] = [
  { id: "distance", label: "Ближе" },
  { id: "rate", label: "Выше ставка" },
  { id: "date", label: "Раньше" },
];

/** Нижняя панель фильтров ленты — помогает быстро найти подходящую смену. */
export function FilterSheet({
  value,
  onApply,
  onClose,
}: {
  value: FeedFilters;
  onApply: (f: FeedFilters) => void;
  onClose: () => void;
}) {
  const [f, setF] = useState<FeedFilters>({ sort: "distance", ...value });
  const [saved, setSaved] = useState(false);
  const set = (patch: Partial<FeedFilters>) => setF((cur) => ({ ...cur, ...patch }));

  async function saveSearch() {
    haptic("success");
    const title = f.role ? `Поиск: ${STAFF_ROLE_LABELS[f.role as StaffRole]}` : "Мой поиск";
    try {
      await createSavedSearch(title, f, true);
      setSaved(true);
    } catch {
      haptic("error");
    }
  }

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
          maxHeight: "88vh",
          overflowY: "auto",
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
          {ROLES.map((r) => (
            <Chip
              key={r}
              on={f.role === r}
              label={STAFF_ROLE_LABELS[r]}
              onClick={() => set({ role: f.role === r ? undefined : r })}
            />
          ))}
        </div>

        <label className="muted">Тип ставки</label>
        <div className="row" style={{ margin: "8px 0 16px" }}>
          <Chip on={!f.rate_type} label="Любая" onClick={() => set({ rate_type: undefined })} />
          <Chip on={f.rate_type === "perHour"} label="₽/час" onClick={() => set({ rate_type: "perHour" })} />
          <Chip on={f.rate_type === "perShift"} label="₽/смена" onClick={() => set({ rate_type: "perShift" })} />
        </div>

        <label className="muted">Подойдёт мне</label>
        <div className="row" style={{ flexWrap: "wrap", margin: "8px 0 16px" }}>
          <Chip on={!!f.no_med_book} label="Без медкнижки" onClick={() => set({ no_med_book: !f.no_med_book })} />
          <Chip on={!!f.no_experience} label="Без опыта" onClick={() => set({ no_experience: !f.no_experience })} />
          <Chip on={!!f.verified_only} label="✓ Проверенные" onClick={() => set({ verified_only: !f.verified_only })} />
        </div>

        <label className="muted" htmlFor="minrate">Ставка от, ₽</label>
        <input
          id="minrate"
          className="input"
          inputMode="numeric"
          style={{ marginBottom: 16 }}
          placeholder="например, 300"
          value={f.min_rate ?? ""}
          onChange={(e) => set({ min_rate: e.target.value ? Number(e.target.value) : undefined })}
        />

        <label className="muted">Сортировка</label>
        <div className="row" style={{ margin: "8px 0 18px" }}>
          {SORTS.map((s) => (
            <Chip key={s.id} on={f.sort === s.id} label={s.label} onClick={() => set({ sort: s.id })} />
          ))}
        </div>

        <button
          className="btn ghost"
          style={{ marginBottom: 10 }}
          disabled={saved}
          onClick={saveSearch}
        >
          {saved ? "✓ Поиск сохранён — пришлём новые смены" : "🔔 Сохранить поиск и уведомлять"}
        </button>

        <div className="row" style={{ gap: 10 }}>
          <button className="btn secondary" onClick={() => onApply({ sort: "distance" })}>
            Сбросить
          </button>
          <button className="btn" onClick={() => onApply(f)}>
            Показать
          </button>
        </div>
      </div>
    </div>
  );
}
