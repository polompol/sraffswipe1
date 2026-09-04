import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { createSavedSearch, type FeedFilters } from "@/api/endpoints";
import { toast } from "@/components/Toast";

/**
 * Подписка «напишите мне, когда появится смена».
 *
 * Пустая лента на старте — не тупик: сервису нечего показать сегодня, но он
 * может позвать завтра. Подписка сохраняет ровно те условия, что стоят
 * сейчас, и бот пишет человеку, как только подходящая смена появится.
 *
 * Свой флаг «уже подписан» нужен и после ответа сервера: кнопка должна
 * остаться выключенной («Будем присылать»), а встроенная в неё защита от
 * двойного нажатия снимается сразу, как только запрос завершился.
 */
export function useShiftAlerts(filters: FeedFilters) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function subscribe(): Promise<void> {
    setBusy(true);
    try {
      await createSavedSearch(
        filters.city ? `Смены · ${filters.city}` : "Смены рядом",
        filters,
        true,
      );
      qc.invalidateQueries({ queryKey: ["saved-searches"] });
      setDone(true);
      toast("Готово! Напишем в бота, как появится смена рядом", "success");
    } catch {
      toast("Не получилось подписаться. Попробуйте ещё раз", "error");
    } finally {
      setBusy(false);
    }
  }

  return { subscribe, busy, done };
}
