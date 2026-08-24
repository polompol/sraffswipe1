import { useState } from "react";
import { CityPicker } from "@/components/CityPicker";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { StaffRole } from "@/types/domain";
import { localISO } from "@/lib/format";
import {
  ROLE_FAMILIES,
  ROLE_FAMILY_LABELS,
  ROLE_FAMILY_ORDER,
  STAFF_ROLE_LABELS,
} from "@/types/domain";
import {
  createSavedSearch,
  deleteSavedSearch,
  listSavedSearches,
  type FeedFilters,
} from "@/api/endpoints";
import { toast } from "@/components/Toast";
import { Button } from "@/components/Button";
import { IconBell, IconCheck } from "@/components/Icons";
import { Sheet } from "@/components/Sheet";
import { haptic } from "@/telegram/sdk";

const SORTS: { id: string; label: string }[] = [
  { id: "distance", label: "Ближе" },
  { id: "rate", label: "Где платят больше" },
  { id: "date", label: "Раньше" },
];

// Дата по времени телефона, а не по Гринвичу: иначе ночью фильтр «Сегодня»
// просил у сервера вчерашний день и лента приходила пустой.
const iso = (d: Date) => localISO(d);

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
  hasLocation = false,
}: {
  value: FeedFilters;
  onApply: (f: FeedFilters) => void;
  onClose: () => void;
  hasLocation?: boolean;
}) {
  const [f, setF] = useState<FeedFilters>({ sort: "distance", ...value });
  const [saved, setSaved] = useState(false);
  const qc = useQueryClient();
  // Сохранённый поиск — это подписка на уведомления о новых сменах. Создать
  // её было можно, а отменить — нет: единственным способом остановить
  // сообщения оставалось заблокировать бота вместе со всеми уведомлениями
  // о своих же сменах. Поэтому список подписок живёт здесь же, где их заводят.
  const { data: searches } = useQuery({
    queryKey: ["saved-searches"],
    queryFn: listSavedSearches,
  });

  async function removeSearch(id: string) {
    haptic("warning");
    try {
      await deleteSavedSearch(id);
      qc.invalidateQueries({ queryKey: ["saved-searches"] });
      toast("Подписка отключена", "success");
    } catch {
      haptic("error");
      toast("Подписка не отключилась — попробуйте ещё раз", "error");
    }
  }
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
      // Без этого только что созданная подписка не появлялась в списке ниже,
      // и человек не видел, чем именно управляет.
      qc.invalidateQueries({ queryKey: ["saved-searches"] });
      toast("Поиск сохранён — пришлём новые смены", "success");
    } catch {
      haptic("error");
      toast("Не получилось подписаться. Попробуйте ещё раз", "error");
    }
  }

  function Chip({ on, label, onClick }: { on: boolean; label: string; onClick: () => void }) {
    return (
      <button
        className="tag"
        style={{
          cursor: "pointer",
          background: on ? "var(--gold-fill)" : "transparent",
          color: on ? "var(--on-brand)" : "var(--text)",
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
      title="Что ищете"
      onClose={onClose}
      footer={
        <>
          <Button
            variant="secondary"
            onClick={() => onApply({ sort: "distance", city: f.city })}
          >
            Сбросить
          </Button>
          <Button onClick={() => onApply(f)}>Показать смены</Button>
        </>
      }
    >
      {/* Тот же выбор из справочника, что в анкете и при публикации. Со
          свободным вводом человек писал «Питер» — и лента оказывалась пустой:
          смены в базе приводятся к «Санкт-Петербург», а сравнение шло буква в
          букву. Ошибки при этом никакой, просто пусто. */}
      <CityPicker
        value={f.city ?? ""}
        onChange={(c) => set({ city: c || undefined })}
      />

      <div className="form-label">Когда</div>
      <div className="row" style={{ flexWrap: "wrap", margin: "8px 0 16px" }}>
        <Chip on={!f.date_from} label="Любой день" onClick={() => set({ date_from: undefined, date_to: undefined })} />
        <Chip on={whenKind === "today"} label="Сегодня" onClick={() => set(dayRange(0))} />
        <Chip on={whenKind === "tomorrow"} label="Завтра" onClick={() => set(dayRange(1))} />
        <Chip on={whenKind === "weekend"} label="Выходные" onClick={() => set(weekendRange())} />
      </div>

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

      <div className="form-label">Как считают ставку</div>
      <div className="row" style={{ margin: "8px 0 16px", flexWrap: "wrap" }}>
        <Chip on={!f.rate_type} label="Неважно" onClick={() => set({ rate_type: undefined })} />
        <Chip on={f.rate_type === "perHour"} label="₽/час" onClick={() => set({ rate_type: "perHour" })} />
        <Chip on={f.rate_type === "perShift"} label="₽/смена" onClick={() => set({ rate_type: "perShift" })} />
      </div>

      <div className="form-label">Подойдёт мне</div>
      <div className="row" style={{ flexWrap: "wrap", margin: "8px 0 16px" }}>
        <Chip on={!!f.no_med_book} label="Без медкнижки" onClick={() => set({ no_med_book: !f.no_med_book })} />
        <Chip on={!!f.tips_only} label="С чаевыми" onClick={() => set({ tips_only: !f.tips_only })} />
        <Chip on={!!f.verified_only} label="✓ Проверенные" onClick={() => set({ verified_only: !f.verified_only })} />
      </div>

      <label className="form-label" htmlFor="minrate">Ставка от, ₽</label>
      <input
        id="minrate"
        className="input"
        inputMode="numeric"
        style={{ marginBottom: 16 }}
        placeholder="например, 300"
        value={f.min_rate ?? ""}
        onChange={(e) => set({ min_rate: e.target.value ? Number(e.target.value) : undefined })}
      />

      <div className="form-label">Сначала показывать</div>
      <div className="row" style={{ margin: "8px 0 18px", flexWrap: "wrap" }}>
        {SORTS.map((s) => (
          <Chip key={s.id} on={f.sort === s.id} label={s.label} onClick={() => set({ sort: s.id })} />
        ))}
      </div>

      <label className="form-label" htmlFor="radius">
        {hasLocation ? `Не дальше ${f.radius_km ?? 25} км` : "Не дальше"}
      </label>
      {hasLocation ? (
        <input
          id="radius"
          type="range"
          min={1}
          max={30}
          step={1}
          value={f.radius_km ?? 25}
          onChange={(e) => set({ radius_km: Number(e.target.value) })}
          style={{ width: "100%", margin: "8px 0 18px", accentColor: "var(--gold)" }}
        />
      ) : (
        <div className="muted" style={{ fontSize: "var(--text-xs)", margin: "6px 0 18px" }}>
          Разрешите доступ к месту — и сможете искать смены поближе.
        </div>
      )}

      {/* Иконка идёт через icon: компонент сам отделяет её от текста, поэтому
          обёртка-span внутри кнопки больше не нужна. */}
      <Button
        variant="ghost"
        disabled={saved}
        icon={saved ? <IconCheck size={16} /> : <IconBell size={16} />}
        onClick={saveSearch}
      >
        {saved ? "Будем присылать" : "Присылать новые смены в бота"}
      </Button>

      {!!searches?.length && (
        <>
          <div className="form-label" style={{ marginTop: 18 }}>
            Мои подписки на новые смены
          </div>
          <div style={{ display: "grid", gap: 8 }}>
            {searches.map((s) => (
              <div key={s.id} className="row" style={{ gap: 8 }}>
                <span className="grow">
                  <b style={{ fontSize: "var(--text-base)" }}>{s.title}</b>
                  <div className="muted small">
                    {s.notify ? "уведомления включены" : "уведомления выключены"}
                  </div>
                </span>
                <button
                  className="tag"
                  style={{
                    flex: "none",
                    cursor: "pointer",
                    color: "var(--danger)",
                    borderColor: "var(--danger)",
                  }}
                  onClick={() => removeSearch(s.id)}
                >
                  Отключить
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </Sheet>
  );
}
