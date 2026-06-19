// Sentry на фронте — подключается ТОЛЬКО если задан VITE_SENTRY_DSN.
// Грузится динамически (отдельным чанком), поэтому без DSN бандл не растёт.

type SentryLike = { captureException: (e: unknown) => void };

let sentry: SentryLike | null = null;

export async function initSentry(): Promise<void> {
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (!dsn) return;
  try {
    const Sentry = await import("@sentry/react");
    Sentry.init({
      dsn,
      environment: import.meta.env.MODE,
      tracesSampleRate: 0.1,
      // Не отправляем тело запросов/PII по умолчанию.
      sendDefaultPii: false,
    });
    sentry = Sentry;
  } catch {
    /* Sentry опционален — его отсутствие не должно ломать приложение. */
  }
}

export function captureException(error: unknown): void {
  sentry?.captureException(error);
}
