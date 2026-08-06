import { useState } from "react";
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

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div
        className="fade-up sheet"
        style={{
          padding: 20,
          paddingBottom: "calc(20px + env(safe-area-inset-bottom))",
        }}
        onClick={(e) => e.stopPropagation()}
      >
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
        <div className="row" style={{ gap: 10 }}>
          <Button variant="secondary" onClick={onClose}>
            Отмена
          </Button>
          <Button loading={busy} disabled={!reason} onClick={submit}>
            Отправить
          </Button>
        </div>
      </div>
    </div>
  );
}
