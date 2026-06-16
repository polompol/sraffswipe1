export function Loading({ label = "Загрузка…" }: { label?: string }) {
  return (
    <div className="card" style={{ textAlign: "center" }} role="status" aria-live="polite">
      {label}
    </div>
  );
}

/** Прямоугольник-скелетон. */
export function Skeleton({
  height = 16,
  width = "100%",
  radius = 10,
  style,
}: {
  height?: number | string;
  width?: number | string;
  radius?: number;
  style?: React.CSSProperties;
}) {
  return (
    <div
      className="skeleton"
      style={{ height, width, borderRadius: radius, ...style }}
      aria-hidden
    />
  );
}

/** Скелетон карточки списка (мэтчи/смены). */
export function SkeletonList({ rows = 3 }: { rows?: number }) {
  return (
    <div style={{ display: "grid", gap: 12 }} role="status" aria-live="polite">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="card row" style={{ gap: 12 }}>
          <Skeleton height={52} width={52} radius={12} />
          <div style={{ flex: 1, display: "grid", gap: 8 }}>
            <Skeleton height={14} width="60%" />
            <Skeleton height={12} width="40%" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Скелетон большой свайп-карточки. */
export function SkeletonCard() {
  return (
    <div role="status" aria-live="polite">
      <Skeleton height="62vh" radius={24} style={{ minHeight: 420 }} />
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
