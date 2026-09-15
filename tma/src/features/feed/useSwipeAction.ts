import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { MatchModel, Seeker, SwipeDirection, Vacancy } from "@/types/domain";
import { sendSwipe, track } from "@/api/endpoints";
import { toast } from "@/components/Toast";
import { apiError } from "@/lib/errors";
import { pop } from "@/lib/sfx";

/**
 * Что происходит по свайпу: отклик или приглашение, и совпал ли интерес.
 *
 * Жило внутри FeedPage вперемешку с разметкой — сорок строк на две ветки
 * (работник и заведение) и на разбор ошибок сервера.
 *
 * Про ошибку отдельно: её обязательно пробросить дальше. Колода вернёт
 * карточку на место, а без этого она улетала насовсем — человек читал
 * «оплатите счёт», а смена уже исчезла, и вернуться к ней было нельзя ничем.
 */
export function useSwipeAction(isSeeker: boolean) {
  const qc = useQueryClient();
  const [match, setMatch] = useState<MatchModel | null>(null);
  // Одинаковое решение по одной карточке может прийти сразу из двух мест:
  // человек начал свайп пальцем и тут же нажал кнопку, либо дважды тапнул на
  // плохой связи. Сервер идемпотентен, но два HTTP-запроса всё равно создают
  // лишнюю задержку/аналитику и могут показать два одинаковых ответа UI.
  // Держим только НЕЗАВЕРШЁННЫЕ решения; после успеха или ошибки повтор снова
  // разрешён. Направление входит в ключ, поэтому «нет» никогда не слипнется с
  // «да» по той же карточке.
  const inFlight = useRef(new Map<string, Promise<boolean>>());

  /** true — успешный отклик БЕЗ совпадения: список-вид покажет тост.
   *  При совпадении тоста нет: его заменяет экран «Взаимно!». */
  async function runSwipe(item: Vacancy | Seeker, dir: SwipeDirection): Promise<boolean> {
    track("swipe", { dir });
    try {
      const res = await sendSwipe(item.id, isSeeker ? "vacancy" : "user", dir);
      if (!res.matched || !res.matchId) return dir === "like";

      track("match");
      pop();
      if (isSeeker) {
        const v = item as Vacancy;
        setMatch({
          id: res.matchId,
          employerId: v.employerId,
          vacancyId: v.id,
          status: "matched",
          confirmedBySeeker: false,
          confirmedByEmployer: false,
          companyName: v.companyName,
          companyPhotoUrl: v.companyPhotoUrl,
          role: v.role,
          shiftDate: v.date,
          shiftStart: v.startTime,
          shiftEnd: v.endTime,
        });
      } else {
        // Заведение о совпадении узнавало только всплывашкой: карточка
        // улетала, экран не менялся, и попасть в чат отсюда было нельзя —
        // приходилось искать человека руками во вкладке «Люди». Человеку при
        // этом уже ушло уведомление и открылся чат. Теперь обе стороны видят
        // один и тот же экран с кнопкой «Перейти в чат».
        const s = item as Seeker;
        setMatch({
          id: res.matchId,
          employerId: "me",
          vacancyId: res.vacancyId ?? "",
          status: "matched",
          confirmedBySeeker: false,
          confirmedByEmployer: false,
          seekerName: s.name,
          role: res.role,
          shiftDate: res.shiftDate,
          shiftStart: res.shiftStart,
          shiftEnd: res.shiftEnd,
        });
      }
      qc.invalidateQueries({ queryKey: ["matches"] });
      return false;
    } catch (e) {
      // Сервер объясняет отказ сам: просроченная комиссия (402), слишком
      // часто (429), «на смену уже набраны все люди» (409). Запасной текст
      // нужен только на случай, когда объяснения нет.
      toast(
        apiError(
          e,
          isSeeker
            ? "Отклик не ушёл. Попробуйте ещё раз"
            : "Не получилось позвать. Попробуйте ещё раз",
        ),
        "error",
      );
      throw e;
    }
  }

  function swipe(item: Vacancy | Seeker, dir: SwipeDirection): Promise<boolean> {
    const targetType = isSeeker ? "vacancy" : "user";
    const key = `${targetType}:${item.id}:${dir}`;
    const current = inFlight.current.get(key);
    if (current) return current;

    const run = runSwipe(item, dir);
    inFlight.current.set(key, run);
    const clear = () => {
      if (inFlight.current.get(key) === run) inFlight.current.delete(key);
    };
    run.then(clear, clear);
    return run;
  }

  return { swipe, match, setMatch };
}
