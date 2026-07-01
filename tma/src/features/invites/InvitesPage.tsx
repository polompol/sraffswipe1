import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { MatchModel, SwipeDirection, Vacancy } from "@/types/domain";
import { fetchInvites, sendSwipe, track } from "@/api/endpoints";
import { VacancyList } from "../feed/VacancyList";
import { MatchOverlay } from "../feed/MatchOverlay";
import { ErrorBox, Loading } from "@/components/States";
import { toast } from "@/components/Toast";
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

  async function act(v: Vacancy, dir: SwipeDirection) {
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
      } else if (dir !== "dislike") {
        toast("Отклик отправлен", "success");
      }
    } catch {
      toast("Не удалось. Попробуйте ещё раз", "error");
    }
  }

  return (
    <div className="page">
      <h1 className="h1">Кто меня зовёт</h1>
      <p className="muted" style={{ marginTop: -6 }}>
        Заведения, которые уже лайкнули тебя. Откликнись — и сразу мэтч.
      </p>

      {isLoading && <Loading />}
      {isError && <ErrorBox onRetry={() => refetch()} />}

      {!isLoading && !isError && data && data.length === 0 && (
        <div className="card" style={{ textAlign: "center", padding: 32 }}>
          <div style={{ color: "var(--gold)", display: "flex", justifyContent: "center" }}>
            <IconBolt size={34} />
          </div>
          <h2 className="h2" style={{ marginTop: 10 }}>Пока никто не позвал</h2>
          <p className="muted">
            Листай ленту и откликайся — заведения начнут звать в ответ.
          </p>
          <button className="btn" style={{ marginTop: 12 }} onClick={() => nav("/feed")}>
            Открыть ленту
          </button>
        </div>
      )}

      {!isLoading && !isError && data && data.length > 0 && (
        <VacancyList items={data} onAct={act} />
      )}

      {match && <MatchOverlay match={match} onClose={() => setMatch(null)} />}
    </div>
  );
}
