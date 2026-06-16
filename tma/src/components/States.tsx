export function Loading({ label = "Загрузка…" }: { label?: string }) {
  return (
    <div className="card" style={{ textAlign: "center" }} role="status" aria-live="polite">
      {label}
    </div>
  );
}

export function ErrorBox({ onRetry }: { onRetry?: () => void }) {
  return (
    <div className="card" style={{ textAlign: "center" }} role="alert">
      <div style={{ fontSize: 40 }}>😕</div>
      <p className="muted" style={{ margin: "8px 0 12px" }}>
        Не удалось загрузить. Проверьте соединение.
      </p>
      {onRetry && (
        <button className="btn secondary" onClick={onRetry}>
          Повторить
        </button>
      )}
    </div>
  );
}
