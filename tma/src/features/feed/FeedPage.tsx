import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import type { MatchModel, Seeker, StaffRole, SwipeDirection, Vacancy } from "@/types/domain";
import { STAFF_ROLE_LABELS } from "@/types/domain";
import { useSession } from "@/store/session";
import { TodayShift } from "./TodayShift";
import {
  createSavedSearch,
  fetchFeed,
  fetchMe,
  fetchMyVacancies,
  listSavedSearches,
  sendSwipe,
  track,
  type FeedFilters,
} from "@/api/endpoints";
import { todayISO } from "@/lib/format";
import { useGeo } from "@/lib/useGeo";
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
import { apiError } from "@/lib/errors";
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
  IconChevronRight,
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
  const controller = useRef<
    ((dir: SwipeDirection, expectKey?: string) => void) | null
  >(null);

  const activeFilterCount = isSeeker
    ? (filters.role ? 1 : 0) +
      (filters.city ? 1 : 0) +
      (filters.min_rate ? 1 : 0) +
      (filters.date_from ? 1 : 0) +
      (filters.rate_type ? 1 : 0) +
      (filters.no_med_book ? 1 : 0) +
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

  // Возвращает true, если это был успешный отклик без мэтча — тогда список-вид
  // покажет тост «Отклик отправлен». В колоде (свайп) результат игнорируется —
  // там обратная связь — улетающая карточка.
  async function handleSwipe(item: Vacancy | Seeker, dir: SwipeDirection): Promise<boolean> {
    const targetType = isSeeker ? "vacancy" : "user";
    track("swipe", { dir });
    try {
      const res = await sendSwipe(item.id, targetType, dir);
      if (res.matched && res.matchId) {
        track("match");
        pop();
        if (isSeeker) {
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
            shiftDate: v.date,
            shiftStart: v.startTime,
            shiftEnd: v.endTime,
          });
          qc.invalidateQueries({ queryKey: ["matches"] });
          return false; // мэтч → оверлей, тост не нужен
        }
        // Раньше заведение о мэтче узнавало только всплывашкой: карточка
        // улетала, экран не менялся, и попасть в чат отсюда было нельзя —
        // приходилось искать человека руками во вкладке «Люди». Человеку при
        // этом уже ушло уведомление и открылся чат. Теперь обе стороны видят
        // один и тот же экран с кнопкой «Перейти в чат».
        const s = item as Seeker;
        setMatch({
          id: res.matchId,
          seekerId: s.id,
          employerId: "me",
          vacancyId: res.vacancyId ?? "",
          status: "matched",
          confirmedBySeeker: false,
          confirmedByEmployer: false,
          seekerName: s.name,
          role: res.role,
          shiftDate: res.shiftDate,
          shiftStart: res.shiftStart,
          shiftEnd: res.shiftEnd,
        });
        qc.invalidateQueries({ queryKey: ["matches"] });
        return false;
      }
      return dir === "like";
    } catch (e) {
      // Сервер объясняет отказ сам: просроченная комиссия (402), слишком
      // часто (429), «на смену уже набраны все люди» (409). Последнее
      // подменялось бессмысленным «Не удалось отправить».
      toast(apiError(e, "Не удалось отправить. Попробуйте ещё раз"), "error");
      // Ошибку пробрасываем дальше: колода вернёт карточку на место. Раньше
      // она улетала насовсем — человек читал «оплатите счёт», а смена уже
      // исчезла из колоды, и вернуться к ней было нельзя ничем.
      throw e;
    }
  }

  // Подпись строки фильтров: «Смены рядом · Москва · 12».
  const locText =
    (isSeeker ? "Смены рядом" : "Кандидаты рядом") +
    (isSeeker && filters.city ? ` · ${filters.city}` : "") +
    (!isSeeker && filters.role
      ? ` · ${STAFF_ROLE_LABELS[filters.role as StaffRole]}`
      : "") +
    (typeof data?.length === "number" ? ` · ${data.length}` : "");

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
          <Logo size={24} color="#fff" />
        </span>
        {/* Именно h1: это главный экран приложения, и заголовка первого уровня
            на нём не было вовсе — скринридер не мог назвать страницу. Класс
            .h2 оставляем: он задаёт размер, а не уровень. */}
        <h1 className="h2" style={{ margin: 0, flex: 1, fontSize: "var(--text-2xl)", letterSpacing: -0.3 }}>
          Staff<span style={{ color: "var(--gold)" }}>Swipe</span>
        </h1>
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

      {/* Один ряд вместо трёх: город, «Сегодня» и сохранённые поиски раньше
          шли отдельными строками и съедали ~54px над карточкой — а карточка
          и есть продукт. */}
      {/* Перенос строк задан в CSS, а не здесь: на низких экранах строка
          обязана оставаться одной, а стиль в разметке перебивал бы правило. */}
      <div className="row feed-filters" style={{ gap: 8, marginBottom: 10 }}>
        {/* Имя кнопки для скринридера начинается с того же текста, что виден
            на экране. Прежний aria-label («Сменить город и фильтры») его
            перекрывал: вслух не читались ни город, ни число найденных смен,
            а голосовое управление не находило кнопку по надписи. */}
        <button
          className="feed-loc"
          onClick={() => setFilterOpen(true)}
          aria-label={`${locText} — открыть фильтры`}
        >
          {locText}
          <span aria-hidden style={{ color: "var(--gold)", marginLeft: 4, display: "inline-flex", transform: "rotate(90deg)" }}>
            <IconChevronRight size={16} />
          </span>
        </button>

        {isSeeker && <span className="spacer" />}

        {isSeeker && (
          <button
            className="tag"
            aria-pressed={todayOnly}
            style={{
              cursor: "pointer",
              borderColor: todayOnly ? "var(--gold-fill)" : "var(--border-strong)",
              background: todayOnly ? "var(--gold-fill)" : "transparent",
              color: todayOnly ? "#fff" : "var(--text)",
            }}
            onClick={toggleToday}
          >
            <IconFire size={14} /> Сегодня
          </button>
        )}

        {isSeeker && searches?.map((s) => (
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
            Пока у вас нет ни одной смены, кандидаты не смогут откликнуться —
            даже если вы их лайкнете. Опубликуйте смену, и пойдут отклики.
          </p>
          <Button size="sm" block={false} onClick={() => nav("/vacancy/new")}>
            + Разместить смену
          </Button>
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
            {isSeeker ? <IconFilter size={34} /> : <IconBell size={34} />}
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
          {/* Подписку прятать в пилоте было ошибкой: лента пуста именно на
              старте, и это единственный способ не потерять человека, который
              пришёл первым. Механика работает — незачем её скрывать. */}
          {isSeeker && (
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
          {isSeeker && (
            <button className="btn ghost" style={{ marginTop: 10 }} onClick={() => setFilterOpen(true)}>
              {filters.city ? "Сменить город" : "Настроить фильтры"}
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
