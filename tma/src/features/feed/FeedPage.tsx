import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import type { Seeker, StaffRole, SwipeDirection, Vacancy } from "@/types/domain";
import { STAFF_ROLE_LABELS } from "@/types/domain";
import { useSession } from "@/store/session";
import { TodayShift } from "./TodayShift";
import {
  fetchFeed,
  fetchMe,
  fetchMyVacancies,
  listSavedSearches,
  type FeedFilters,
} from "@/api/endpoints";
import { useGeo } from "@/lib/useGeo";
import { SwipeDeck } from "./SwipeDeck";
import { useFeedFilters, toggleTodayFilter } from "./useFeedFilters";
import { useShiftAlerts } from "./useShiftAlerts";
import { useSwipeAction } from "./useSwipeAction";
import { FeedHeader } from "./FeedHeader";
import { FeedEmpty } from "./FeedEmpty";
import { LS } from "@/lib/storage";
import { FilterChips, type Chip } from "./FilterChips";
import { SeekerCardContent, VacancyCardContent } from "./Cards";
import { MatchOverlay } from "./MatchOverlay";
import { FilterSheet } from "./FilterSheet";
import { CandidateFilterSheet } from "./CandidateFilterSheet";
import { CardBack } from "./CardBack";
import {
  CandidateDetailsBody,
  CandidateNote,
  ShiftDetailsBody,
  ShiftNote,
} from "./DetailsBody";
import { VacancyList } from "./VacancyList";
import { ErrorBox, SkeletonCard } from "@/components/States";
import { Button } from "@/components/Button";
import {
  IconSkip,
  IconLike,
  IconFire,
  IconBell,
  IconPin,
} from "@/components/Icons";

export function FeedPage() {
  const role = useSession((s) => s.role) ?? "seeker";
  const isSeeker = role === "seeker";
  const nav = useNavigate();
  const qc = useQueryClient();
  // Свайп и его последствия — отдельным хуком (useSwipeAction).
  const { swipe: handleSwipe, match, setMatch } = useSwipeAction(isSeeker);
  const [empty, setEmpty] = useState(false);
  // Перевёрнута ли карточка. Кнопки под колодой лежат поверх неё и живут вне
  // колоды, а их подписи белые — на светлой изнанке они исчезали.
  const [backOpen, setBackOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const { data: me } = useQuery({ queryKey: ["me"], queryFn: fetchMe, enabled: isSeeker });

  // Условия ленты живут отдельным хуком: хранение города, подстановка его из
  // анкеты, переключатель «Сегодня» и подсчёт включённых условий — всё это
  // чистая логика, и она покрыта тестами (useFeedFilters.test.ts).
  const feed = useFeedFilters(isSeeker, me?.city);
  const filters = feed.filters;

  function applyFilters(f: FeedFilters) {
    feed.apply(f);
    // Колода начинает набор заново — «карточки кончились» больше не в силе.
    setEmpty(false);
  }

  // Пустая лента на старте — не тупик: превращаем в подписку на уведомления.
  const alerts = useShiftAlerts(filters);

  // Быстрый фильтр «Сегодня» — главный крючок: смены, которые горят сейчас.
  const todayOnly = feed.todayOnly;
  function toggleToday() {
    applyFilters(toggleTodayFilter(filters));
  }
  const [view, setView] = useState<"swipe" | "list">(
    (localStorage.getItem(LS.view) as "swipe" | "list" | null) ?? "swipe",
  );
  const controller = useRef<
    ((dir: SwipeDirection, expectKey?: string) => void) | null
  >(null);

  const activeFilterCount = feed.activeCount;

  // Геолокация устройства → «смены рядом» (расстояние + сортировка «Ближе» +
  // фильтр радиуса). Спрашиваем только у соискателя; отказ — работаем без.
  const geo = useGeo(isSeeker);
  const feedFilters =
    isSeeker && geo ? { ...filters, lat: geo.lat, lng: geo.lng } : filters;

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["feed", role, feedFilters],
    queryFn: () => fetchFeed(role, feedFilters),
  });

  // Первый чип — город и сколько нашлось: «Москва · 12».
  //
  // Число здесь не украшение: без него человек не отличает «фильтр слишком
  // узкий» от «сегодня и правда пусто», а это два разных следующих шага.
  // Без выбранного города — «Рядом», а не «Все города»: сервер и так отдаёт
  // ленту по городу самого человека (у заведения — по его городу, у
  // соискателя — по профилю и радиусу). «Все города» было бы неправдой.
  const cityChipValue = filters.city || "Рядом";
  const foundCount = typeof data?.length === "number" ? data.length : undefined;

  /** Снять один фильтр, не трогая остальные. */
  function clearFilter(key: keyof FeedFilters) {
    const next = { ...filters };
    delete next[key];
    applyFilters(next);
  }

  /* ГЛАВНЫЕ ФИЛЬТРЫ РОЛИ.
   *
   * У работника и заведения они РАЗНЫЕ, потому что разные вопросы. Работник
   * спрашивает «какие смены доступны сегодня и сколько платят»; заведение —
   * «кто выйдет сегодня и можно ли на него положиться».
   *
   * Про район у работника: его тут нет намеренно, и это не забывчивость. У
   * смены в базе есть город и адрес строкой, а поля района нет вовсе —
   * фильтровать не по чему. Ближайшее, что работает по-настоящему, — радиус
   * в километрах от человека, и он живёт в шторке рядом с городом.
   */
  const mainChips: Chip[] = isSeeker
    ? [
        {
          label: "Город",
          picker: true,
          value: cityChipValue,
          count: foundCount,
          icon: <IconPin size={13} />,
          onPick: () => setFilterOpen(true),
        },
        {
          label: "Сегодня",
          value: todayOnly ? "Сегодня" : undefined,
          icon: <IconFire size={13} />,
          onPick: toggleToday,
        },
        {
          label: "Роль",
          picker: true,
          value: filters.role ? STAFF_ROLE_LABELS[filters.role as StaffRole] : undefined,
          onPick: () => setFilterOpen(true),
          onClear: () => clearFilter("role"),
        },
        {
          label: "Оплата",
          picker: true,
          value: filters.min_rate ? `от ${filters.min_rate} ₽` : undefined,
          onPick: () => setFilterOpen(true),
          onClear: () => clearFilter("min_rate"),
        },
      ]
    : [
        {
          label: "Город",
          picker: true,
          value: cityChipValue,
          count: foundCount,
          icon: <IconPin size={13} />,
          onPick: () => setFilterOpen(true),
        },
        {
          label: "Сегодня",
          value: filters.available_today ? "Может сегодня" : undefined,
          icon: <IconFire size={13} />,
          onPick: () =>
            applyFilters({ ...filters, available_today: !filters.available_today || undefined }),
        },
        {
          label: "Роль",
          picker: true,
          value: filters.role ? STAFF_ROLE_LABELS[filters.role as StaffRole] : undefined,
          onPick: () => setFilterOpen(true),
          onClear: () => clearFilter("role"),
        },
        {
          label: "Район",
          picker: true,
          value: filters.district || undefined,
          onPick: () => setFilterOpen(true),
          onClear: () => clearFilter("district"),
        },
        {
          label: "Надёжность",
          value: filters.reliable_only ? "Без неявок" : undefined,
          onPick: () =>
            applyFilters({ ...filters, reliable_only: !filters.reliable_only || undefined }),
        },
      ];

  const { data: searches } = useQuery({
    queryKey: ["saved-searches"],
    queryFn: listSavedSearches,
    enabled: isSeeker,
  });

  // Заведению без единой вакансии мэтч физически невозможен (мэтч ищется среди
  // его смен). Лайкать кандидатов впустую — тупик, поэтому ведём разместить смену.
  const { data: myVacs } = useQuery({
    queryKey: ["my-vacancies"],
    queryFn: fetchMyVacancies,
    enabled: !isSeeker,
  });
  const employerNoVacancy = !isSeeker && myVacs != null && myVacs.length === 0;

  /** Отклик прямо из шторки «Детали смены».
   *
   *  В колоде дёргаем ту же механику, что и кнопка «Отклик»: карточка улетает
   *  так же, как от пальца — человек видит привычный ответ, а не пустоту.
   *  Ключ карточки передаём явно: пока шторка была открыта, сверху могла
   *  оказаться другая смена, и смахнуть надо именно ту, которую читали. */

  // Экран с колодой живёт по своим правилам: он не прокручивается, а карточка
  // занимает всё, что осталось от экрана. Поэтому у него отдельный класс —
  // см. `.page.feed-deck` в index.css.
  const deckMode =
    !isLoading && !isError && !!data && !empty && data.length > 0
    && !(isSeeker && view === "list");

  return (
    <div
      className={
        deckMode ? (backOpen ? "page feed-deck back-open" : "page feed-deck") : "page"
      }
    >
      <FeedHeader
        isSeeker={isSeeker}
        view={view}
        onView={(next) => {
          setView(next);
          localStorage.setItem(LS.view, next);
        }}
        activeFilterCount={activeFilterCount}
        onFilters={() => setFilterOpen(true)}
      />

      {/* ГЛАВНЫЕ ФИЛЬТРЫ — на экране, а не в шторке.
          Раньше всё жило за иконкой, и пустая лента читалась как «смен нет»,
          хотя стоял забытый вчерашний фильтр. Остальные условия (тип ставки,
          «без медкнижки», «только проверенные») остаются в шторке: их меняют
          раз в жизни, а эти четыре — каждый день. */}
      <FilterChips chips={mainChips} />

      {isSeeker && !!searches?.length && (
        <div className="chips-row" style={{ marginTop: 6 }}>
          {searches.map((s) => (
            <button
              key={s.id}
              className="tag"
              style={{ cursor: "pointer", borderColor: "var(--gold)", color: "var(--gold)", flex: "none" }}
              onClick={() => applyFilters(s.filters)}
            >
              <IconBell size={13} /> {s.title}
            </button>
          ))}
        </div>
      )}

      {/* Своя смена — выше чужих. В день смены человеку нужно ровно одно:
          во сколько, куда и код прихода. */}
      <TodayShift />

      {employerNoVacancy && (
        <div
          className="card"
          style={{ marginBottom: 12, borderColor: "var(--gold)" }}
        >
          <b>Сначала разместите смену</b>
          <p className="muted" style={{ margin: "6px 0 10px" }}>
            Пока смен нет, откликаться не на что — даже если вы кого-то
            позовёте.
          </p>
          <Button size="sm" block={false} onClick={() => nav("/vacancy/new")}>
            + Разместить смену
          </Button>
        </div>
      )}

      {isLoading && <SkeletonCard />}
      {isError && <ErrorBox onRetry={() => refetch()} />}

      {!isLoading && !isError && data && (empty || data.length === 0) && (
        <FeedEmpty
          isSeeker={isSeeker}
          city={filters.city}
          activeFilterCount={activeFilterCount}
          alerts={alerts}
          onResetFilters={() => applyFilters({})}
          onOpenFilters={() => setFilterOpen(true)}
        />
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
              onFlipChange={setBackOpen}
              renderBack={(v, c) => (
                <CardBack title={v.companyName} note={<ShiftNote />} onBack={c.close}>
                  <ShiftDetailsBody v={v} />
                </CardBack>
              )}
              onEmpty={() => setEmpty(true)}
              controllerRef={(fn) => (controller.current = fn)}
            />
          ) : (
            <SwipeDeck<Seeker>
              items={data as Seeker[]}
              keyOf={(s) => s.id}
              renderCard={(s) => <SeekerCardContent s={s} />}
              onSwipe={handleSwipe}
              // Заведение не «хочет» человека, а зовёт его на смену: штамп
              // «ХОЧУ» поперёк чужого лица читался двусмысленно и расходился
              // с кнопкой под колодой, которая подписана «Позвать».
              likeStamp="ЗОВУ"
              onFlipChange={setBackOpen}
              renderBack={(person, c) => (
                <CardBack
                  title={`${person.name}${person.age != null ? `, ${person.age}` : ""}`}
                  note={<CandidateNote />}
                  onBack={c.close}
                >
                  <CandidateDetailsBody s={person} />
                </CardBack>
              )}
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
              {/* Подпись зависит от роли: заведение не откликается, а зовёт.
                  Обе стороны видели «Отклик», а незрячему заведению вслух
                  читалось «хочу здесь работать». */}
              <button
                className="act act-like"
                aria-label={isSeeker ? "Откликнуться — хочу здесь работать" : "Позвать на смену"}
                onClick={() => controller.current?.("like")}
              >
                <IconLike size={34} />
              </button>
              <span className="act-label act-label-like">
                {isSeeker ? "Отклик" : "Позвать"}
              </span>
            </div>
          </div>
        </>
      )}

      {match && (
        <MatchOverlay
          match={match}
          role={isSeeker ? "seeker" : "employer"}
          onClose={() => setMatch(null)}
        />
      )}
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
