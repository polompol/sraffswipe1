import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import type { MatchModel, Seeker, SwipeDirection, Vacancy } from "@/types/domain";
import { useSession } from "@/store/session";
import { fetchFeed, sendSwipe } from "@/api/endpoints";
import { SwipeDeck } from "./SwipeDeck";
import { SeekerCardContent, VacancyCardContent } from "./Cards";
import { MatchOverlay } from "./MatchOverlay";

export function FeedPage() {
  const role = useSession((s) => s.role) ?? "seeker";
  const isSeeker = role === "seeker";
  const nav = useNavigate();
  const [match, setMatch] = useState<MatchModel | null>(null);
  const [empty, setEmpty] = useState(false);
  const controller = useRef<((dir: SwipeDirection) => void) | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["feed", role],
    queryFn: () => fetchFeed(role),
  });

  async function handleSwipe(item: Vacancy | Seeker, dir: SwipeDirection) {
    const targetType = isSeeker ? "vacancy" : "user";
    const res = await sendSwipe(item.id, targetType, dir);
    if (res.matched && res.match && isSeeker) setMatch(res.match);
  }

  return (
    <div className="page">
      <div className="row" style={{ marginBottom: 8 }}>
        <h2 className="h2" style={{ margin: 0 }}>
          Staff<span style={{ color: "var(--gold)" }}>Swipe</span>
        </h2>
        <span className="spacer" />
        <button className="tab" style={{ flex: "none", width: "auto" }} onClick={() => nav("/pricing")}>
          <span className="ico">⚡</span>
        </button>
      </div>
      <p className="muted" style={{ marginBottom: 12 }}>
        {isSeeker ? "Смены рядом с вами" : "Кандидаты рядом"}
        {data ? ` · ${data.length}` : ""}
      </p>

      {isLoading && <div className="card">Загрузка…</div>}

      {!isLoading && data && (empty || data.length === 0) && (
        <div className="card" style={{ textAlign: "center", padding: 40 }}>
          <div style={{ fontSize: 56 }}>✅</div>
          <h2 className="h2" style={{ marginTop: 12 }}>
            {isSeeker ? "Вы посмотрели все смены" : "Кандидаты закончились"}
          </h2>
          <p className="muted">Загляните позже — появляются новые</p>
        </div>
      )}

      {!isLoading && data && !empty && data.length > 0 && (
        <>
          {isSeeker ? (
            <SwipeDeck<Vacancy>
              items={data as Vacancy[]}
              keyOf={(v) => v.id}
              renderCard={(v) => <VacancyCardContent v={v} />}
              onSwipe={handleSwipe}
              onEmpty={() => setEmpty(true)}
              controllerRef={(fn) => (controller.current = fn)}
            />
          ) : (
            <SwipeDeck<Seeker>
              items={data as Seeker[]}
              keyOf={(s) => s.id}
              renderCard={(s) => <SeekerCardContent s={s} />}
              onSwipe={handleSwipe}
              onEmpty={() => setEmpty(true)}
              controllerRef={(fn) => (controller.current = fn)}
            />
          )}

          <div className="actions">
            <button className="act" style={{ borderColor: "var(--dislike)", color: "var(--dislike)" }} onClick={() => controller.current?.("dislike")}>
              ✕
            </button>
            <button className="act sm" style={{ borderColor: "var(--super)", color: "var(--super)" }} onClick={() => controller.current?.("superlike")}>
              ⚡
            </button>
            <button className="act" style={{ borderColor: "var(--like)", color: "var(--like)" }} onClick={() => controller.current?.("like")}>
              ♥
            </button>
          </div>
        </>
      )}

      {match && <MatchOverlay match={match} onClose={() => setMatch(null)} />}
    </div>
  );
}
