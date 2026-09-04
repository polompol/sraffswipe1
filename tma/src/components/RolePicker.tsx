/** Выбор должностей, сгруппированных по месту работы: зал, бар, кухня, хозяйство.
 *
 *  Один и тот же список стоял в пяти местах — в форме смены, в анкете
 *  работника, в приветственном экране и в обоих фильтрах. Добавить должность
 *  или переставить группу значило найти и поправить все пять; пропустишь одно
 *  — и человек не сможет выбрать в анкете то, что заведение уже публикует.
 *
 *  Выбор бывает и одиночный (у смены должность одна), и множественный (человек
 *  готов выйти кем угодно) — поэтому компонент не хранит состояние, а только
 *  спрашивает «эта выбрана?» и сообщает «нажали на эту».
 */
import {
  ROLE_FAMILIES,
  ROLE_FAMILY_LABELS,
  ROLE_FAMILY_ORDER,
  STAFF_ROLE_LABELS,
  type StaffRole,
} from "@/types/domain";
import { ToggleChip } from "./ToggleChip";

export function RolePicker({
  isOn,
  onPick,
}: {
  isOn: (role: StaffRole) => boolean;
  onPick: (role: StaffRole) => void;
}) {
  return (
    <div className="role-picker">
      {ROLE_FAMILY_ORDER.map((fam) => (
        <div key={fam} className="role-picker-family">
          <div className="hint">{ROLE_FAMILY_LABELS[fam]}</div>
          <div className="row" style={{ flexWrap: "wrap", gap: 8 }}>
            {ROLE_FAMILIES[fam].map((r) => (
              <ToggleChip
                key={r}
                on={isOn(r)}
                label={STAFF_ROLE_LABELS[r]}
                onClick={() => onPick(r)}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
