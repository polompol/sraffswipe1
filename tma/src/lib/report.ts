// Единая точка отправки ошибок. Логируем в консоль, шлём в Sentry (если задан
// VITE_SENTRY_DSN) и на backend (события воронки) — падения фронта видны и без
// внешних сервисов, и с полным трейсом в Sentry, если он подключён.
import { track } from "@/api/endpoints";
import { captureException } from "./sentry";

export function reportError(error: unknown, context?: string): void {
  console.error("[StaffSwipe]", context ?? "", error);
  try {
    captureException(error);
    const message = error instanceof Error ? error.message : String(error);
    track("client_error", { context: context ?? "", message: message.slice(0, 300) });
  } catch {
    /* отчёт об ошибке не должен падать сам */
  }
}
