import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import type { SwipeDirection, Vacancy } from "@/types/domain";
import { listFavorites, sendSwipe } from "@/api/endpoints";
import { showBackButton } from "@/telegram/sdk";
import { ErrorBox, SkeletonList } from "@/components/States";
import { EmptyState } from "@/components/EmptyState";
import { IconBookmark } from "@/components/Icons";
import { toast } from "@/components/Toast";
import { VacancyList } from "./VacancyList";

/** Избранные (сохранённые) смены — вернуться и откликнуться позже. */
export function FavoritesPage() {
  const nav = useNavigate();
  useEffect(() => showBackButton(() => nav(-1)), [nav]);
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["favorites"],
    queryFn: listFavorites,
  });

  async function onAct(v: Vacancy, dir: SwipeDirection) {
    if (dir === "dislike") return;
    try {
      await sendSwipe(v.id, "vacancy", dir);
    } catch {
      toast("Не удалось отправить отклик", "error");
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
            icon={<IconBookmark size={34} />}
            title="Пока пусто"
            text="Нажимайте на закладку у смены в списке — она сохранится здесь, чтобы откликнуться позже."
          />
        )}
        {data && data.length > 0 && <VacancyList items={data} onAct={onAct} />}
      </div>
    </div>
  );
}
