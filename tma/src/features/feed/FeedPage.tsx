import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import type { MatchModel, Seeker, SwipeDirection, Vacancy } from "@/types/domain";
import { useSession } from "@/store/session";
import {
  fetchFeed,
  listSavedSearches,
  sendSwipe,
  track,
  type FeedFilters,
} from "@/api/endpoints";
import { SwipeDeck } from "./SwipeDeck";
import { SeekerCardContent, VacancyCardContent } from "./Cards";
import { MatchOverlay } from "./MatchOverlay";
import { FilterSheet } from "./FilterSheet";
import { ErrorBox, SkeletonCard } from "@/components/States";

export function FeedPage() {
  const role = useSession((s) => s.role) ?? "seeker";
  const isSeeker = role === "seeker";
  const nav = useNavigate();
  const qc = useQueryClient();
  const [match, setMatch] = useState<MatchModel | null>(null);
  const [empty, setEmpty] = useState(false);
  const [filters, setFilters] = useState<FeedFilters>({});
  const [filterOpen, setFilterOpen] = useState(false);
  const controller = useRef<((dir: SwipeDirection) => void) | null>(null);

  const activeFilterCount =
    (filters.role ? 1 : 0) +
    (filters.min_rate ? 1 : 0) +
    (filters.date_from ? 1 : 0) +
    (filters.rate_type ? 1 : 0) +
    (filters.no_med_book ? 1 : 0) +
    (filters.no_experience ? 1 : 0) +
    (filters.verified_only ? 1 : 0);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["feed", role, filters],
    queryFn: () => fetchFeed(role, filters),
  });

  const { data: searches } = useQuery({
    queryKey: ["saved-searches"],
    queryFn: listSavedSearches,
    enabled: isSeeker,
  });

  async function handleSwipe(item: Vacancy | Seeker, dir: SwipeDirection) {
    const targetType = isSeeker ? "vacancy" : "user";
    track("swipe", { dir });
    const res = await sendSwipe(item.id, targetType, dir);
    if (res.matched && res.matchId && isSeeker) {
      track("match");
      const v = item as Vacancy;
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
    }
  }

  return (
    <div className="page">
      <div className="row" style={{ marginBottom: 8 }}>
        <h2 className="h2" style={{ margin: 0 }}>
          Staff<span style={{ color: "var(--gold)" }}>Swipe</span>
        </h2>
        <span className="spacer" />
        {isSeeker && (
          <button
            className="tab"
            style={{ flex: "none", width: "auto", color: activeFilterCount ? "var(--gold)" : undefined }}
            aria-label="Фильтры"
            onClick={() => setFilterOpen(true)}
          >
            <span className="ico">⚙{activeFilterCount ? ` ${activeFilterCount}` : ""}</span>
          </button>
        )}
        <button className="tab" style={{ flex: "none", width: "auto" }} aria-label="Тарифы и буст" onClick={() => nav("/pricing")}>
          <span className="ico">⚡</span>
        </button>
      </div>
      <p className="muted" style={{ marginBottom: 6 }}>
        {isSeeker ? "Смены рядом с вами" : "Кандидаты рядом"}
        {data ? ` · ${data.length}` : ""}
      </p>
      <p className="muted" style={{ marginBottom: 10, fontSize: 12 }}>
        ⭐ 4.8 · 1 200+ смен закрыто · средний отклик 7 мин
      </p>

      {isSeeker && searches && searches.length > 0 && (
        <div className="row" style={{ flexWrap: "wrap", marginBottom: 12 }}>
          {searches.map((s) => (
            <button
              key={s.id}
              className="tag"
              style={{ cursor: "pointer", borderColor: "var(--gold)", color: "var(--gold)" }}
              onClick={() => {
                setFilters(s.filters);
                setEmpty(false);
              }}
            >
              🔔 {s.title}
            </button>
          ))}
        </div>
      )}

      {isLoading && <SkeletonCard />}
      {isError && <ErrorBox onRetry={() => refetch()} />}

      {!isLoading && !isError && data && (empty || data.length === 0) && (
        <div className="card" style={{ textAlign: "center", padding: 40 }}>
          <div style={{ fontSize: 56 }}>✅</div>
          <h2 className="h2" style={{ marginTop: 12 }}>
            {isSeeker ? "Вы посмотрели все смены" : "Кандидаты закончились"}
          </h2>
          <p className="muted">Загляните позже — появляются новые</p>
        </div>
      )}

      {!isLoading && !isError && data && !empty && data.length > 0 && (
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
            <button className="act" aria-label="Пропустить" style={{ borderColor: "var(--dislike)", color: "var(--dislike)" }} onClick={() => controller.current?.("dislike")}>
              ✕
            </button>
            <button className="act sm" aria-label="Срочно (супер-лайк)" style={{ borderColor: "var(--super)", color: "var(--super)" }} onClick={() => controller.current?.("superlike")}>
              ⚡
            </button>
            <button className="act" aria-label="Хочу здесь работать" style={{ borderColor: "var(--like)", color: "var(--like)" }} onClick={() => controller.current?.("like")}>
              ♥
            </button>
          </div>
        </>
      )}

      {match && <MatchOverlay match={match} onClose={() => setMatch(null)} />}
      {filterOpen && (
        <FilterSheet
          value={filters}
          onClose={() => {
            setFilterOpen(false);
            qc.invalidateQueries({ queryKey: ["saved-searches"] });
          }}
          onApply={(f) => {
            setFilters(f);
            setEmpty(false);
            setFilterOpen(false);
            qc.invalidateQueries({ queryKey: ["saved-searches"] });
          }}
        />
      )}
    </div>
  );
}
