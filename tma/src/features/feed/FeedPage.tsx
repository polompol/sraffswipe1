import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import type { MatchModel, Seeker, StaffRole, SwipeDirection, Vacancy } from "@/types/domain";
import { STAFF_ROLE_LABELS } from "@/types/domain";
import { useSession } from "@/store/session";
import {
  createSavedSearch,
  fetchFeed,
  fetchMe,
  listSavedSearches,
  sendSwipe,
  track,
  type FeedFilters,
} from "@/api/endpoints";
import { todayISO, estimatedPay } from "@/lib/format";
import { useGeo } from "@/lib/useGeo";
import { CountUp } from "@/components/CountUp";
import { pop } from "@/lib/sfx";
import { SwipeDeck } from "./SwipeDeck";
import { SeekerCardContent, VacancyCardContent } from "./Cards";
import { MatchOverlay } from "./MatchOverlay";
import { FilterSheet } from "./FilterSheet";
import { CandidateFilterSheet } from "./CandidateFilterSheet";
import { ShiftDetailsSheet } from "./ShiftDetailsSheet";
import { VacancyList } from "./VacancyList";
import { ErrorBox, SkeletonCard } from "@/components/States";
import { toast } from "@/components/Toast";
import { haptic } from "@/telegram/sdk";
import { Logo } from "@/components/Logo";
import { PILOT_MODE } from "@/lib/flags";
import {
  IconSkip,
  IconSuper,
  IconLike,
  IconFilter,
  IconBolt,
  IconList,
  IconCards,
  IconFire,
  IconBell,
  IconCheck,
} from "@/components/Icons";

export function FeedPage() {
  const role = useSession((s) => s.role) ?? "seeker";
  const isSeeker = role === "seeker";
  const nav = useNavigate();
  const qc = useQueryClient();
  const [match, setMatch] = useState<MatchModel | null>(null);
  const [details, setDetails] = useState<Vacancy | null>(null);
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

  // Пустая лента на старте — не тупик: превращаем в подписку на уведомления.
  // Как только заведение заведёт подходящую смену, бот напишет человеку.
  const [subscribing, setSubscribing] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  async function notifyOnNewShifts() {
    setSubscribing(true);
    try {
      await createSavedSearch(
        filters.city ? `Смены · ${filters.city}` : "Смены рядом",
        filters,
        true,
      );
      qc.invalidateQueries({ queryKey: ["saved-searches"] });
      setSubscribed(true);
      toast("Готово! Напишем в бота, как появится смена рядом", "success");
    } catch {
      toast("Не удалось. Попробуйте ещё раз", "error");
    } finally {
      setSubscribing(false);
    }
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

  const activeFilterCount = isSeeker
    ? (filters.role ? 1 : 0) +
      (filters.city ? 1 : 0) +
      (filters.min_rate ? 1 : 0) +
      (filters.date_from ? 1 : 0) +
      (filters.rate_type ? 1 : 0) +
      (filters.no_med_book ? 1 : 0) +
      (filters.no_experience ? 1 : 0) +
      (filters.tips_only ? 1 : 0) +
      (filters.verified_only ? 1 : 0)
    : (filters.role ? 1 : 0) +
      (filters.district ? 1 : 0) +
      (filters.available_today ? 1 : 0) +
      (filters.reliable_only ? 1 : 0);

  // Геолокация устройства → «смены рядом» (расстояние + сортировка «Ближе» +
  // фильтр радиуса). Спрашиваем только у соискателя; отказ — работаем без.
  const geo = useGeo(isSeeker);
  const feedFilters =
    isSeeker && geo ? { ...filters, lat: geo.lat, lng: geo.lng } : filters;

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["feed", role, feedFilters],
    queryFn: () => fetchFeed(role, feedFilters),
  });

  // «Деньги рядом сейчас» — сумма оплат всех смен в ленте. Money-магнит:
  // человек заходит посмотреть, сколько денег лежит рядом прямо сейчас.
  const moneyNear =
    isSeeker && data
      ? (data as Vacancy[]).reduce((s, v) => s + estimatedPay(v), 0)
      : 0;

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
        pop();
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
        toast("Срочные закончились — откликайтесь обычным лайком", "error");
      } else if (status === 429) {
        toast("Слишком много действий подряд — подождите пару секунд", "error");
      } else {
        toast("Не удалось отправить. Попробуйте ещё раз", "error");
      }
    }
  }

  return (
    <div className="page">
      <div className="row" style={{ marginBottom: 6, gap: 4 }}>
        <span
          aria-hidden
          style={{
            width: 34,
            height: 34,
            borderRadius: 10,
            marginRight: 8,
            background: "linear-gradient(135deg,var(--gold-soft),var(--gold))",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Logo size={24} color="#fff" />
        </span>
        <h2 className="h2" style={{ margin: 0, flex: 1, fontSize: 26, letterSpacing: -0.3 }}>
          Staff<span style={{ color: "var(--gold)" }}>Swipe</span>
        </h2>
        {isSeeker && (
          <button
            className="icon-btn"
            aria-label={view === "swipe" ? "Показать списком" : "Показать карточками"}
            onClick={() => {
              const next = view === "swipe" ? "list" : "swipe";
              setView(next);
              localStorage.setItem("ss_view", next);
              haptic("light");
            }}
          >
            {view === "swipe" ? <IconList size={22} /> : <IconCards size={22} />}
          </button>
        )}
        <button
          className="icon-btn"
          aria-label="Фильтры"
          style={{ color: activeFilterCount ? "var(--gold)" : undefined }}
          onClick={() => setFilterOpen(true)}
        >
          <IconFilter size={22} />
          {activeFilterCount > 0 && (
            <span className="icon-badge">{activeFilterCount}</span>
          )}
        </button>
        <button className="icon-btn" aria-label="Тарифы и буст" onClick={() => nav("/pricing")}>
          <IconBolt size={22} />
        </button>
      </div>

      <button
        className="feed-loc"
        onClick={() => setFilterOpen(true)}
        aria-label={isSeeker ? "Сменить город и фильтры" : "Фильтры кандидатов"}
      >
        {isSeeker ? "Смены рядом" : "Кандидаты рядом"}
        {isSeeker && filters.city ? ` · ${filters.city}` : ""}
        {!isSeeker && filters.role ? ` · ${STAFF_ROLE_LABELS[filters.role as StaffRole]}` : ""}
        {typeof data?.length === "number" ? ` · ${data.length}` : ""}
        <span style={{ color: "var(--gold)", marginLeft: 4 }}>⌄</span>
      </button>

      {isSeeker && !PILOT_MODE && moneyNear > 0 && !empty && (
        <div
          className="money-near"
          onClick={() => haptic("light")}
        >
          <span className="money-near-cap">Рядом сейчас смен на</span>
          <span className="money-near-sum">
            <CountUp value={moneyNear} /> ₽
          </span>
          <span className="money-near-sub">забери свою — листай ленту</span>
        </div>
      )}

      {isSeeker && (
        <div className="row" style={{ flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
          <button
            className="tag"
            aria-pressed={todayOnly}
            style={{
              cursor: "pointer",
              borderColor: todayOnly ? "var(--gold)" : "var(--dislike)",
              background: todayOnly ? "var(--gold)" : "transparent",
              color: todayOnly ? "#fff" : "var(--text)",
            }}
            onClick={toggleToday}
          >
            <IconFire size={14} /> Сегодня
          </button>
        </div>
      )}

      {isSeeker && searches && searches.length > 0 && (
        <div className="row" style={{ flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
          {searches.map((s) => (
            <button
              key={s.id}
              className="tag"
              style={{ cursor: "pointer", borderColor: "var(--gold)", color: "var(--gold)" }}
              onClick={() => applyFilters(s.filters)}
            >
              <IconBell size={13} /> {s.title}
            </button>
          ))}
        </div>
      )}

      {isLoading && <SkeletonCard />}
      {isError && <ErrorBox onRetry={() => refetch()} />}

      {!isLoading && !isError && data && (empty || data.length === 0) && (
        <div className="card" style={{ textAlign: "center", padding: 40 }}>
          <div style={{
            width: 64, height: 64, borderRadius: "50%", margin: "0 auto",
            background: "var(--grad-brand)", color: "#fff",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <IconCheck size={34} />
          </div>
          <h2 className="h2" style={{ marginTop: 12 }}>
            {isSeeker
              ? filters.city
                ? `В городе ${filters.city} пока нет смен`
                : "Вы посмотрели все смены"
              : "Кандидаты закончились"}
          </h2>
          <p className="muted">
            {isSeeker
              ? "Оставь подписку — и мы напишем в бота, как только смена появится рядом"
              : "Загляните позже — появляются новые"}
          </p>
          {isSeeker && !PILOT_MODE && (
            <button
              className="btn"
              style={{ marginTop: 14 }}
              disabled={subscribing || subscribed}
              onClick={notifyOnNewShifts}
            >
              <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                <IconBell size={18} />
                {subscribed ? "Будем присылать новые смены" : "Присылать новые смены в бота"}
              </span>
            </button>
          )}
          {isSeeker && filters.city && (
            <button className="btn ghost" style={{ marginTop: 10 }} onClick={() => setFilterOpen(true)}>
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
              renderCard={(v) => <VacancyCardContent v={v} onDetails={setDetails} />}
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
            <div className="act-col">
              <button className="act act-skip" aria-label="Пропустить" onClick={() => controller.current?.("dislike")}>
                <IconSkip size={32} />
              </button>
              <span className="act-label act-label-skip">Пропустить</span>
            </div>
            <div className="act-col">
              <button className="act sm act-super" aria-label="Срочно — показать заведению первым" onClick={() => controller.current?.("superlike")}>
                <IconSuper size={28} />
              </button>
              <span className="act-label act-label-super">Срочно</span>
            </div>
            <div className="act-col">
              <button className="act act-like" aria-label="Откликнуться — хочу здесь работать" onClick={() => controller.current?.("like")}>
                <IconLike size={34} />
              </button>
              <span className="act-label act-label-like">Отклик</span>
            </div>
          </div>
        </>
      )}

      {match && <MatchOverlay match={match} onClose={() => setMatch(null)} />}
      {details && <ShiftDetailsSheet v={details} onClose={() => setDetails(null)} />}
      {filterOpen && isSeeker && (
        <FilterSheet
          value={filters}
          hasLocation={!!geo}
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
      {filterOpen && !isSeeker && (
        <CandidateFilterSheet
          value={filters}
          onClose={() => setFilterOpen(false)}
          onApply={(f) => {
            applyFilters(f);
            setFilterOpen(false);
          }}
        />
      )}
    </div>
  );
}
