// Единая точка отправки ошибок. Логируем в консоль и отправляем на backend
// (события воронки), чтобы падения фронта были видны серверно без внешних
// сервисов. Для Sentry — добавьте init в main.tsx и Sentry.captureException сюда.
import { track } from "@/api/endpoints";

export function reportError(error: unknown, context?: string): void {
  console.error("[StaffSwipe]", context ?? "", error);
  try {
    const message = error instanceof Error ? error.message : String(error);
    track("client_error", { context: context ?? "", message: message.slice(0, 300) });
  } catch {
    /* отчёт об ошибке не должен падать сам */
  }
}
