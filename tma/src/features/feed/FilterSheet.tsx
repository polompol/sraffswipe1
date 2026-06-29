import { useState } from "react";
import { createPortal } from "react-dom";
import type { StaffRole } from "@/types/domain";
import { STAFF_ROLE_LABELS } from "@/types/domain";
import { createSavedSearch, type FeedFilters } from "@/api/endpoints";
import { toast } from "@/components/Toast";
import { IconBell, IconCheck } from "@/components/Icons";
import { haptic } from "@/telegram/sdk";

const ROLES = Object.keys(STAFF_ROLE_LABELS) as StaffRole[];

const SORTS: { id: string; label: string }[] = [
  { id: "distance", label: "Ближе" },
  { id: "rate", label: "Выше ставка" },
  { id: "date", label: "Раньше" },
];

const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Диапазон «через N дней» (один день). */
function dayRange(plus: number): { date_from: string; date_to: string } {
  const d = new Date();
  d.setDate(d.getDate() + plus);
  return { date_from: iso(d), date_to: iso(d) };
}

/** Ближайшие выходные (сб–вс). */
function weekendRange(): { date_from: string; date_to: string } {
  const now = new Date();
  const toSat = (6 - now.getDay() + 7) % 7;
  const sat = new Date();
  sat.setDate(now.getDate() + toSat);
  const sun = new Date(sat);
  sun.setDate(sat.getDate() + 1);
  return { date_from: iso(sat), date_to: iso(sun) };
}

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

  // Какой пресет «Когда» сейчас выбран (для подсветки чипа).
  const whenKind =
    f.date_from && f.date_from === f.date_to && f.date_from === iso(new Date())
      ? "today"
      : f.date_from && f.date_from === f.date_to && f.date_from === dayRange(1).date_from
        ? "tomorrow"
        : f.date_from && f.date_to && f.date_from !== f.date_to
          ? "weekend"
          : "any";

  async function saveSearch() {
    haptic("success");
    const title = f.role ? `Поиск: ${STAFF_ROLE_LABELS[f.role as StaffRole]}` : "Мой поиск";
    try {
      await createSavedSearch(title, f, true);
      setSaved(true);
      toast("Поиск сохранён — пришлём новые смены", "success");
    } catch {
      haptic("error");
      toast("Не удалось сохранить поиск", "error");
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
        <h2 className="h2" style={{ marginTop: 0 }}>Фильтры</h2>

        <label className="muted" htmlFor="city">Город</label>
        <input
          id="city"
          className="input"
          style={{ marginBottom: 16 }}
          placeholder="например, Москва"
          value={f.city ?? ""}
          onChange={(e) => set({ city: e.target.value || undefined })}
        />

        <label className="muted">Когда</label>
        <div className="row" style={{ flexWrap: "wrap", margin: "8px 0 16px" }}>
          <Chip on={!f.date_from} label="Любой день" onClick={() => set({ date_from: undefined, date_to: undefined })} />
          <Chip on={whenKind === "today"} label="Сегодня" onClick={() => set(dayRange(0))} />
          <Chip on={whenKind === "tomorrow"} label="Завтра" onClick={() => set(dayRange(1))} />
          <Chip on={whenKind === "weekend"} label="Выходные" onClick={() => set(weekendRange())} />
        </div>

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
          disabled={saved}
          onClick={saveSearch}
        >
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            {saved ? <IconCheck size={16} /> : <IconBell size={16} />}
            {saved ? "Поиск сохранён — пришлём новые смены" : "Сохранить поиск и уведомлять"}
          </span>
        </button>
        </div>

        <div className="sheet-foot">
          <button className="btn secondary" onClick={() => onApply({ sort: "distance" })}>
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
