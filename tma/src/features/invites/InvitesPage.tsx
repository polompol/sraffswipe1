import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { MatchModel, SwipeDirection, Vacancy } from "@/types/domain";
import { fetchInvites, sendSwipe, track } from "@/api/endpoints";
import { VacancyList } from "../feed/VacancyList";
import { MatchOverlay } from "../feed/MatchOverlay";
import { ErrorBox, SkeletonList } from "@/components/States";
import { toast } from "@/components/Toast";
import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/Button";
import { pop } from "@/lib/sfx";
import { showBackButton } from "@/telegram/sdk";
import { IconBolt } from "@/components/Icons";

/** «Кто меня зовёт» — смены заведений, которые уже лайкнули соискателя.
 *  Отклик по такой смене → мгновенный мэтч (лайк взаимный). Поднимает
 *  match-rate: человек видит, что он нужен, и отвечает в один тап. */
export function InvitesPage() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const [match, setMatch] = useState<MatchModel | null>(null);
  useEffect(() => showBackButton(() => nav(-1)), [nav]);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["invites"],
    queryFn: fetchInvites,
  });

  async function act(v: Vacancy, dir: SwipeDirection): Promise<boolean> {
    track("swipe", { dir });
    try {
      const res = await sendSwipe(v.id, "vacancy", dir);
      qc.invalidateQueries({ queryKey: ["invites"] });
      if (res.matched && res.matchId) {
        track("match");
        pop();
        setMatch({
          id: res.matchId,
          seekerId: "me",
          employerId: v.employerId,
          vacancyId: v.id,
          status: "matched",
          confirmedBySeeker: false,
          confirmedByEmployer: false,
          companyName: v.companyName,
          companyPhotoUrl: v.companyPhotoUrl,
          role: v.role,
        });
        return false; // мэтч → показываем оверлей, тост не нужен
      }
      // Успешный отклик без мэтча → VacancyList покажет тост (не дублируем).
      return dir !== "dislike";
    } catch {
      toast("Отклик не ушёл. Попробуйте ещё раз", "error");
      return false;
    }
  }

  return (
    // Обёртка .app даёт ширину 520 и центрирование, как у остальных экранов
    // этой части приложения (Настройки, Помощь, Анкета).
    <div className="app">
      <div className="page">
      <h1 className="h1">Кто меня зовёт</h1>

      {/* Единый стиль состояний со всеми остальными экранами: раньше здесь
          были текстовая «Загрузка…» и самодельное пустое состояние. */}
      {isLoading && <SkeletonList rows={3} />}
      {isError && <ErrorBox onRetry={() => refetch()} />}

      {!isLoading && !isError && data && data.length === 0 && (
        <EmptyState
          fill
          icon={<IconBolt size={34} />}
          title="Пока никто не позвал"
          text="Листайте смены и откликайтесь — заведения начнут звать в ответ."
          action={<Button onClick={() => nav("/feed")}>Смотреть смены</Button>}
        />
      )}

      {!isLoading && !isError && data && data.length > 0 && (
        <>
          {/* Подпись — только над настоящим списком: над пустым экраном она
              велела отвечать там, где отвечать некому. */}
          <p className="muted" style={{ marginTop: -6 }}>
            Ответьте — и сразу откроется чат.
          </p>
          <VacancyList items={data} onAct={act} />
        </>
      )}

      {match && <MatchOverlay match={match} onClose={() => setMatch(null)} />}
      </div>
    </div>
  );
}
