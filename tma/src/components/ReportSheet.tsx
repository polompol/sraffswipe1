import { useState } from "react";
import { createPortal } from "react-dom";
import {
  reportTarget,
  type ReportReason,
  type ReportTargetType,
} from "@/api/endpoints";
import { toast } from "@/components/Toast";
import { haptic } from "@/telegram/sdk";
import { Button } from "@/components/Button";

const REASONS: { id: ReportReason; label: string }[] = [
  { id: "fake", label: "Фейковая вакансия" },
  { id: "scam", label: "Обман / мошенничество" },
  { id: "spam", label: "Спам" },
  { id: "abuse", label: "Оскорбления / абьюз" },
  { id: "other", label: "Другое" },
];

/** Нижняя панель «Пожаловаться» — доверие и безопасность маркетплейса. */
export function ReportSheet({
  targetType,
  targetId,
  onClose,
}: {
  targetType: ReportTargetType;
  targetId: string;
  onClose: () => void;
}) {
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!reason) return;
    setBusy(true);
    try {
      await reportTarget(targetType, targetId, reason, text);
      haptic("success");
      toast("Жалоба отправлена — спасибо, проверим", "success");
      onClose();
    } catch {
      haptic("error");
      toast("Не удалось отправить жалобу", "error");
    } finally {
      setBusy(false);
    }
  }

  // Портал в body: иначе панель наследует анимацию и задержку
  // родительского списка (.stagger) и всплывает с запозданием.
  return createPortal(
    <div className="sheet-backdrop" onClick={onClose}>
      {/* Структура как у остальных панелей: прокручиваемое тело + закреплённый
          низ. Без этого на невысоком экране кнопка «Отправить» уезжала за
          нижнюю кромку листа, и жалобу нельзя было отправить вообще. */}
      <div
        className="fade-up sheet"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet-body">
        <h2 className="h2">Пожаловаться</h2>
        <p className="muted" style={{ marginTop: 4 }}>
          Что не так? Мы проверим и примем меры.
        </p>
        <div
          role="radiogroup"
          aria-label="Причина жалобы"
          style={{ display: "grid", gap: 8, margin: "12px 0 14px" }}
        >
          {REASONS.map((r) => (
            <button
              key={r.id}
              className="card"
              role="radio"
              aria-checked={reason === r.id}
              style={{
                textAlign: "left",
                cursor: "pointer",
                minHeight: 48,
                borderColor: reason === r.id ? "var(--gold)" : "var(--border-strong)",
                color: reason === r.id ? "var(--gold)" : "var(--text)",
              }}
              onClick={() => {
                haptic("select");
                setReason(r.id);
              }}
            >
              {reason === r.id ? "● " : "○ "}
              {r.label}
            </button>
          ))}
        </div>
        <textarea
          className="input"
          style={{ marginBottom: 14, minHeight: 70 }}
          placeholder="Опишите подробнее (необязательно)"
          value={text}
          maxLength={1000}
          onChange={(e) => setText(e.target.value)}
        />
        </div>
        <div className="sheet-foot">
          <Button variant="secondary" onClick={onClose}>
            Отмена
          </Button>
          <Button loading={busy} disabled={!reason} onClick={submit}>
            Отправить
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
