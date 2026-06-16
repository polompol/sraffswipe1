// Единая точка отправки ошибок. Sentry-ready: подключите init в проде
// (VITE_SENTRY_DSN) и замените тело на Sentry.captureException.

export function reportError(error: unknown, context?: string): void {
  console.error("[StaffSwipe]", context ?? "", error);
}
