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
import { LS } from "@/lib/storage";
import { FilterChips, type Chip } from "./FilterChips";
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
import { Button } from "@/components/Button";
import {
  IconSkip,
  IconLike,
  IconFilter,
  IconList,
  IconCards,
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
  const [details, setDetails] = useState<Vacancy | null>(null);
  const [empty, setEmpty] = useState(false);
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
  async function likeFromDetails(v: Vacancy) {
    setDetails(null);
    if (deckMode && controller.current) {
      controller.current("like", v.id);
      return;
    }
    if (await handleSwipe(v, "like")) toast("Отклик отправлен", "success");
  }

  // Экран с колодой живёт по своим правилам: он не прокручивается, а карточка
  // занимает всё, что осталось от экрана. Поэтому у него отдельный класс —
  // см. `.page.feed-deck` в index.css.
  const deckMode =
    !isLoading && !isError && !!data && !empty && data.length > 0
    && !(isSeeker && view === "list");

  return (
    <div className={deckMode ? "page feed-deck" : "page"}>
      {/* Шапка с именем сервиса. На низких экранах она ужимается (см.
          .feed-head в index.css): место на телефоне принадлежит карточке,
          а не логотипу — своё название человек и так знает. */}
      <div className="row feed-head" style={{ marginBottom: 6, gap: 4 }}>
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
          <Logo size={24} color="var(--on-brand)" />
        </span>
        {/* Именно h1: это главный экран приложения, и заголовка первого уровня
            на нём не было вовсе — скринридер не мог назвать страницу. Класс
            .h2 оставляем: он задаёт размер, а не уровень. */}
        {/* Заголовок отвечает на вопрос, с которым человек открыл приложение,
            а не повторяет его название: оно и так стоит слева значком, и своё
            приложение человек узнаёт. У ролей вопросы разные — «какие смены
            доступны» и «кто выйдет сегодня», — и экраны не должны выглядеть
            одинаково. */}
        <h1
          className="h2"
          style={{ margin: 0, flex: 1, fontSize: "var(--text-2xl)", letterSpacing: -0.3 }}
        >
          {isSeeker ? "Смены рядом" : "Кто свободен"}
        </h1>
        {isSeeker && (
          <button
            className="icon-btn"
            // Тише фильтров: вид переключают редко, а фильтры — каждый день.
            style={{ color: "var(--muted)" }}
            aria-label={view === "swipe" ? "Показать списком" : "Показать карточками"}
            onClick={() => {
              const next = view === "swipe" ? "list" : "swipe";
              setView(next);
              localStorage.setItem(LS.view, next);
              haptic("light");
            }}
          >
            {view === "swipe" ? <IconList size={22} /> : <IconCards size={22} />}
          </button>
        )}
        <button
          className="icon-btn"
          // Число активных фильтров нарисовано бейджем поверх иконки, но
          // aria-label перекрывал его: вслух читалось просто «Фильтры», и
          // сколько их включено — было не узнать.
          aria-label={
            activeFilterCount > 0
              ? `Фильтры, включено: ${activeFilterCount}`
              : "Фильтры"
          }
          style={{ color: activeFilterCount ? "var(--gold)" : undefined }}
          onClick={() => setFilterOpen(true)}
        >
          <IconFilter size={22} />
          {activeFilterCount > 0 && (
            <span className="icon-badge">{activeFilterCount}</span>
          )}
        </button>
      </div>

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
        <div className="card" style={{ textAlign: "center", padding: "var(--space-5)" }}>
          <div style={{
            width: 64, height: 64, borderRadius: "50%", margin: "0 auto",
            background: "var(--grad-brand)", color: "var(--on-brand)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            {isSeeker ? <IconFilter size={34} /> : <IconBell size={34} />}
          </div>
          <h2 className="h2" style={{ marginTop: 12 }}>
            {isSeeker
              ? filters.city
                ? `В городе ${filters.city} пока нет смен`
                : "Вы посмотрели все смены"
              : "Пока никого не нашли"}
          </h2>
          {/* Совет «уберите условия» имеет смысл, только если условия и правда
              включены. Раньше он стоял всегда, и заведение с пустым набором
              фильтров искало сверху то, чего там нет. */}
          <p className="muted">
            {activeFilterCount > 0
              ? "Похоже, условия сверху слишком узкие — попробуйте снять пару"
              : isSeeker
                // Пусто: обещание «напишем в бота» целиком несёт подпись
                // кнопки прямо под этой строкой — и, в отличие от неё,
                // честно меняется после подписки.
                ? ""
                : "Загляните позже: новые люди отмечаются каждый день"}
          </p>
          {/* У заведения на пустом экране не было ни одной кнопки — только
              совет. Если условия включены, дать выход отсюда обязательно. */}
          {!isSeeker && activeFilterCount > 0 && (
            <Button
              variant="secondary"
              style={{ marginTop: 14 }}
              onClick={() => applyFilters({})}
            >
              Снять все условия
            </Button>
          )}
          {/* Подписку прятать в пилоте было ошибкой: лента пуста именно на
              старте, и это единственный способ не потерять человека, который
              пришёл первым. Механика работает — незачем её скрывать. */}
          {isSeeker && (
            <Button
              style={{ marginTop: 14 }}
              // Свой флаг оставляем: он держит кнопку выключенной и ПОСЛЕ
              // подписки («Будем присылать») — этого внутренняя защита кнопки
              // от двойного нажатия не делает, она снимается сразу после ответа.
              disabled={alerts.busy || alerts.done}
              icon={<IconBell size={18} />}
              onClick={alerts.subscribe}
            >
              {alerts.done ? "Будем присылать" : "Присылать новые смены в бота"}
            </Button>
          )}
          {isSeeker && (
            <Button variant="ghost" style={{ marginTop: 10 }} onClick={() => setFilterOpen(true)}>
              {filters.city ? "Сменить город" : "Настроить фильтры"}
            </Button>
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
              onTap={setDetails}
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
      {details && (
        <ShiftDetailsSheet
          v={details}
          onClose={() => setDetails(null)}
          onLike={likeFromDetails}
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
