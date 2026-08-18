import type { MatchModel } from "@/types/domain";

/**
 * Какие смены показывать в напоминании: сегодняшние и ещё не закрытые.
 *
 * Вынесено отдельно и покрыто тестом: это расчёт по датам, а такие ошибки не
 * видны глазом — напоминание просто не приходит в нужный день, и понять это
 * можно только со слов человека, который не вышел на смену.
 */
export function pickTodayShifts(all: MatchModel[], today: string) {
  const shifts = all.filter(
    (m) => m.status === "confirmed" && !m.checkedIn && m.shiftDate === today,
  );
  // Ближайшая по времени начала — если смен несколько.
  const next = [...shifts].sort(
    (a, b) => (a.shiftStart ?? 0) - (b.shiftStart ?? 0),
  )[0];
  return { shifts, next };
}
