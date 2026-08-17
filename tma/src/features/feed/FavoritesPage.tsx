import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { SwipeDirection, Vacancy } from "@/types/domain";
import { listFavorites, sendSwipe } from "@/api/endpoints";
import { showBackButton } from "@/telegram/sdk";
import { ErrorBox, SkeletonList } from "@/components/States";
import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/Button";
import { IconBookmark } from "@/components/Icons";
import { toast } from "@/components/Toast";
import { apiError } from "@/lib/errors";
import { VacancyList } from "./VacancyList";

/** Избранные (сохранённые) смены — вернуться и откликнуться позже. */
export function FavoritesPage() {
  const nav = useNavigate();
  useEffect(() => showBackButton(() => nav(-1)), [nav]);
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["favorites"],
    queryFn: listFavorites,
  });

  const qc = useQueryClient();

  async function onAct(v: Vacancy, dir: SwipeDirection): Promise<boolean> {
    if (dir === "dislike") return false;
    try {
      const res = await sendSwipe(v.id, "vacancy", dir);
      qc.invalidateQueries({ queryKey: ["favorites"] });
      // Заведение уже звало — отклик даёт мэтч сразу. Раньше результат
      // запроса не читали вовсе: чат открывался, а человек об этом не знал
      // и жал «Откликнуться» второй раз.
      if (res.matched && res.matchId) {
        toast("Готово! Открылся чат — договоритесь о деталях", "success");
        nav(`/chat/${res.matchId}`);
        return false;
      }
      return true; // успех → VacancyList покажет тост «Отклик отправлен»
    } catch (e) {
      toast(apiError(e, "Не удалось отправить отклик"), "error");
      return false;
    }
  }

  return (
    <div className="app">
      <div className="page">
        <h1 className="h1" style={{ marginBottom: 12 }}>Избранные смены</h1>
        {isLoading && <SkeletonList />}
        {isError && <ErrorBox onRetry={() => refetch()} />}
        {!isLoading && !isError && (!data || data.length === 0) && (
          <EmptyState
            fill
            icon={<IconBookmark size={34} />}
            title="Пока пусто"
            text="Нажимайте на закладку у смены в списке — она сохранится здесь, чтобы откликнуться позже."
            action={<Button onClick={() => nav("/feed")}>Открыть ленту</Button>}
          />
        )}
        {data && data.length > 0 && (
          <VacancyList items={data} onAct={onAct} hideSkip />
        )}
      </div>
    </div>
  );
}
