import { useState } from "react";
import type { FeedFilters } from "@/api/endpoints";
import { Button } from "@/components/Button";
import { RolePicker } from "@/components/RolePicker";
import { ToggleChip } from "@/components/ToggleChip";
import { Sheet } from "@/components/Sheet";

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

  return (
    <Sheet
      title="Кто нужен"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={() => onApply({})}>
            Сбросить
          </Button>
          <Button onClick={() => onApply(f)}>Показать людей</Button>
        </>
      }
    >
      <div className="form-label">Должность</div>
      <RolePicker
        isOn={(r) => f.role === r}
        onPick={(r) => set({ role: f.role === r ? undefined : r })}
      />

      <label className="form-label" htmlFor="district">Район</label>
      <input
        id="district"
        className="input"
        style={{ marginBottom: 16 }}
        placeholder="например, Басманный"
        value={f.district ?? ""}
        onChange={(e) => set({ district: e.target.value || undefined })}
      />

      <div className="form-label">Кого показывать</div>
      <div className="row" style={{ flexWrap: "wrap", margin: "8px 0 18px" }}>
        <ToggleChip
          on={!!f.available_today}
          label="Может сегодня"
          onClick={() => set({ available_today: !f.available_today })}
        />
        <ToggleChip
          on={!!f.reliable_only}
          label="Кто ни разу не подводил"
          onClick={() => set({ reliable_only: !f.reliable_only })}
        />
      </div>
    </Sheet>
  );
}
