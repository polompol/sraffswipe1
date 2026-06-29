import type { ReactNode } from "react";
import { IconCheck } from "./Icons";

/** Единое пустое состояние: иконка-иллюстрация + заголовок + текст + CTA. */
export function EmptyState({
  icon,
  title,
  text,
  action,
}: {
  icon?: ReactNode;
  title: string;
  text?: string;
  action?: ReactNode;
}) {
  return (
    <div
      className="card fade-up"
      style={{
        textAlign: "center",
        padding: "44px 24px",
        boxShadow: "var(--elev-1)",
      }}
      role="status"
    >
      <div
        aria-hidden
        style={{
          width: 72,
          height: 72,
          margin: "0 auto 14px",
          borderRadius: "50%",
          background: "rgba(199,162,75,.14)",
          color: "var(--gold)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {icon ?? <IconCheck size={34} />}
      </div>
      <h2 className="h2" style={{ marginBottom: text ? 6 : 0 }}>
        {title}
      </h2>
      {text && (
        <p className="muted" style={{ maxWidth: 280, margin: "0 auto" }}>
          {text}
        </p>
      )}
      {action && <div style={{ marginTop: 16 }}>{action}</div>}
    </div>
  );
}
