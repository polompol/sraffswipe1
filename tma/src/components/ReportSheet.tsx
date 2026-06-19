import { useState } from "react";
import {
  reportTarget,
  type ReportReason,
  type ReportTargetType,
} from "@/api/endpoints";
import { toast } from "@/components/Toast";
import { haptic } from "@/telegram/sdk";

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
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(20,14,9,0.5)",
        display: "flex",
        alignItems: "flex-end",
        zIndex: 50,
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
        <h2 className="h2">Пожаловаться</h2>
        <p className="muted" style={{ marginTop: 4 }}>
          Что не так? Мы проверим и примем меры.
        </p>
        <div style={{ display: "grid", gap: 8, margin: "12px 0 14px" }}>
          {REASONS.map((r) => (
            <button
              key={r.id}
              className="card"
              style={{
                textAlign: "left",
                cursor: "pointer",
                borderColor: reason === r.id ? "var(--gold)" : "var(--border)",
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
          <button className="btn secondary" onClick={onClose}>
            Отмена
          </button>
          <button className="btn" disabled={!reason || busy} onClick={submit}>
            {busy ? "Отправляем…" : "Отправить"}
          </button>
        </div>
      </div>
    </div>
  );
}
