import type { ReactNode } from "react";

/** Единое пустое состояние: иконка-иллюстрация + заголовок + текст + CTA. */
export function EmptyState({
  icon = "✨",
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
          fontSize: 52,
          lineHeight: 1,
          marginBottom: 14,
          filter: "saturate(1.05)",
        }}
      >
        {icon}
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
