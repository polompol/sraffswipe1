import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import type { MatchModel, Seeker, SwipeDirection, Vacancy } from "@/types/domain";
import { useSession } from "@/store/session";
import {
  fetchFeed,
  fetchMe,
  listSavedSearches,
  sendSwipe,
  track,
  type FeedFilters,
} from "@/api/endpoints";
import { todayISO } from "@/lib/format";
import { LiveTicker } from "./LiveTicker";
import { SwipeDeck } from "./SwipeDeck";
import { SeekerCardContent, VacancyCardContent } from "./Cards";
import { MatchOverlay } from "./MatchOverlay";
import { FilterSheet } from "./FilterSheet";
import { VacancyList } from "./VacancyList";
import { ErrorBox, SkeletonCard } from "@/components/States";
import { toast } from "@/components/Toast";
import { Logo } from "@/components/Logo";
import { IconSkip, IconSuper, IconLike } from "@/components/Icons";

export function FeedPage() {
  const role = useSession((s) => s.role) ?? "seeker";
  const isSeeker = role === "seeker";
  const nav = useNavigate();
  const qc = useQueryClient();
  const [match, setMatch] = useState<MatchModel | null>(null);
  const [empty, setEmpty] = useState(false);
  const [filters, setFilters] = useState<FeedFilters>(() => {
    const c = localStorage.getItem("ss_city");
    return c ? { city: c } : {};
  });
  const [filterOpen, setFilterOpen] = useState(false);

  // Город по умолчанию — из профиля соискателя, чтобы человек из другого города
  // видел свою ленту, а не чужую (важно для рекламы на широкую аудиторию).
  // Применяем РОВНО ОДИН раз, иначе очистка города пользователем сбрасывалась бы.
  const cityDefaulted = useRef(localStorage.getItem("ss_city") != null);
  const { data: me } = useQuery({ queryKey: ["me"], queryFn: fetchMe, enabled: isSeeker });
  useEffect(() => {
    if (!isSeeker || cityDefaulted.current) return;
    if (me?.city) {
      cityDefaulted.current = true;
      setFilters((f) => ({ ...f, city: me.city }));
    }
  }, [me, isSeeker]);

  function applyFilters(f: FeedFilters) {
    if (f.city) localStorage.setItem("ss_city", f.city);
    else localStorage.removeItem("ss_city");
    setFilters(f);
    setEmpty(false);
  }

  // Быстрый фильтр «Сегодня» — главный крючок: смены, которые горят сейчас.
  const todayOnly = filters.date_from === todayISO() && filters.date_to === todayISO();
  function toggleToday() {
    if (todayOnly) {
      const { date_from: _f, date_to: _t, ...rest } = filters;
      void _f;
      void _t;
      applyFilters(rest);
    } else {
      applyFilters({ ...filters, date_from: todayISO(), date_to: todayISO() });
    }
  }
  const [view, setView] = useState<"swipe" | "list">(
    (localStorage.getItem("ss_view") as "swipe" | "list" | null) ?? "swipe",
  );
  const controller = useRef<((dir: SwipeDirection) => void) | null>(null);

  const activeFilterCount =
    (filters.role ? 1 : 0) +
    (filters.city ? 1 : 0) +
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
    try {
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
    } catch (e) {
      // 402 — закончились супер-лайки (ведём в тарифы), 429 — слишком часто.
      const status = (e as { response?: { status?: number } })?.response?.status;
      if (status === 402) {
        toast("Закончились супер-лайки", "error");
        nav("/pricing");
      } else if (status === 429) {
        toast("Слишком часто — притормозите", "error");
      } else {
        toast("Не удалось отправить. Попробуйте ещё раз", "error");
      }
    }
  }

  return (
    <div className="page">
      <div className="row" style={{ marginBottom: 8 }}>
        <span
          aria-hidden
          style={{
            width: 28,
            height: 28,
            borderRadius: 8,
            marginRight: 8,
            background: "linear-gradient(135deg,var(--gold-soft),var(--gold))",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Logo size={20} color="#fff" />
        </span>
        <h2 className="h2" style={{ margin: 0 }}>
          Staff<span style={{ color: "var(--gold)" }}>Swipe</span>
        </h2>
        <span className="spacer" />
        {isSeeker && (
          <button
            className="tab"
            style={{ flex: "none", width: "auto" }}
            aria-label={view === "swipe" ? "Показать списком" : "Показать свайпом"}
            onClick={() => {
              const next = view === "swipe" ? "list" : "swipe";
              setView(next);
              localStorage.setItem("ss_view", next);
            }}
          >
            <span className="ico">{view === "swipe" ? "☰" : "🃏"}</span>
          </button>
        )}
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
        {isSeeker ? (filters.city ? `Смены · ${filters.city}` : "Смены рядом с вами") : "Кандидаты рядом"}
        {data ? ` · ${data.length}` : ""}
        {isSeeker && (
          <button
            className="tab"
            style={{ display: "inline", flex: "none", width: "auto", padding: "0 6px", color: "var(--gold)" }}
            onClick={() => setFilterOpen(true)}
          >
            {filters.city ? "сменить" : "выбрать город"}
          </button>
        )}
      </p>
      <p className="muted" style={{ marginBottom: 10, fontSize: 12 }}>
        ⭐ 4.8 · 1 200+ смен закрыто · средний отклик 7 мин
      </p>

      {isSeeker && <LiveTicker />}

      {isSeeker && (
        <div className="row" style={{ flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
          <button
            className="tag"
            aria-pressed={todayOnly}
            style={{
              cursor: "pointer",
              borderColor: todayOnly ? "var(--gold)" : "var(--border)",
              background: todayOnly ? "var(--gold)" : "transparent",
              color: todayOnly ? "#fff" : "var(--text)",
            }}
            onClick={toggleToday}
          >
            🔥 Сегодня
          </button>
        </div>
      )}

      {isSeeker && searches && searches.length > 0 && (
        <div className="row" style={{ flexWrap: "wrap", marginBottom: 12 }}>
          {searches.map((s) => (
            <button
              key={s.id}
              className="tag"
              style={{ cursor: "pointer", borderColor: "var(--gold)", color: "var(--gold)" }}
              onClick={() => applyFilters(s.filters)}
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
            {isSeeker
              ? filters.city
                ? `В городе ${filters.city} пока нет смен`
                : "Вы посмотрели все смены"
              : "Кандидаты закончились"}
          </h2>
          <p className="muted">
            {isSeeker && filters.city
              ? "Попробуйте другой город или загляните позже"
              : "Загляните позже — появляются новые"}
          </p>
          {isSeeker && filters.city && (
            <button className="btn ghost" style={{ marginTop: 12 }} onClick={() => setFilterOpen(true)}>
              Сменить город
            </button>
          )}
        </div>
      )}

      {!isLoading && !isError && data && !empty && data.length > 0 && isSeeker && view === "list" && (
        <VacancyList items={data as Vacancy[]} onAct={handleSwipe} />
      )}

      {!isLoading && !isError && data && !empty && data.length > 0 && !(isSeeker && view === "list") && (
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
              <IconSkip size={26} />
            </button>
            <button className="act sm" aria-label="Срочно (супер-лайк)" style={{ borderColor: "var(--super)", color: "var(--super)" }} onClick={() => controller.current?.("superlike")}>
              <IconSuper size={20} />
            </button>
            <button className="act" aria-label="Хочу здесь работать" style={{ borderColor: "var(--like)", color: "var(--like)" }} onClick={() => controller.current?.("like")}>
              <IconLike size={24} />
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
            applyFilters(f);
            setFilterOpen(false);
            qc.invalidateQueries({ queryKey: ["saved-searches"] });
          }}
        />
      )}
    </div>
  );
}
