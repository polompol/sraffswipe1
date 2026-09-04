import { useEffect, useState, type MouseEvent } from "react";
import { useLargeMode, useShortScreen } from "@/lib/large";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { PayMethod, Seeker, Vacancy } from "@/types/domain";
import {
  MED_BOOK_LABELS,
  PAY_METHOD_SHORT,
  STAFF_ROLE_LABELS,
} from "@/types/domain";
import {
  dec1,
  distance,
  estimatedPay,
  fmtTime,
  isUrgentShift,
  money,
  plural,
  rateLabel,
  shiftDayLabel,
  slotsLabel,
} from "@/lib/format";
import {
  IconBank,
  IconBolt,
  IconBookmark,
  IconCalendar,
  IconCard,
  IconCash,
  IconCheck,
  IconFire,
  IconMedBook,
  IconMoney,
  IconPin,
  IconStar,
} from "@/components/Icons";
import { addFavorite, listFavoriteIds, removeFavorite } from "@/api/endpoints";
import { toast } from "@/components/Toast";
import { reliabilityText } from "@/lib/reliability";
import { Rating } from "@/components/Rating";
import { haptic } from "@/telegram/sdk";

const PAY_ICON: Record<PayMethod, typeof IconCash> = {
  cash: IconCash,
  card: IconCard,
  transfer: IconBank,
};

/** Фото карточки: всегда есть бренд-градиент как фолбэк; поверх — картинка,
 *  которая плавно проявляется при загрузке и НЕ ломает вид, если ссылка битая
 *  (onError) или фото нет.
 *
 *  Когда фото нет — а на старте его не будет почти ни у кого — вместо
 *  огромной пустой буквы показываем главное: сколько платят и за что. Раньше
 *  верхняя половина карточки была пустым полем с инициалом, и лента без фото
 *  выглядела так, будто в сервисе ничего нет. */
function SwipePhoto({ src, initial, hasHero, onHero }: {
  src?: string;
  initial: string;
  /** Есть ли у карточки крупная плашка на случай «фото нет». Саму плашку
   *  рисует карточка — здесь только решается, показывать ли её. */
  hasHero?: boolean;
  /** Показывается ли крупная плашка вместо фото — чтобы карточка не повторяла
   *  ту же сумму ещё раз ниже. */
  onHero?: (shown: boolean) => void;
}) {
  const [state, setState] = useState<"load" | "ok" | "err">(src ? "load" : "err");
  // Битая ссылка на фото — тот же случай, что и «фото нет»: показываем
  // главное, а не пустую букву.
  const showHero = !!hasHero && (!src || state === "err");
  useEffect(() => onHero?.(showHero), [showHero, onHero]);
  return (
    <div className="swipe-photo swipe-photo-fallback">
      {showHero ? (
        /* Буква — под плашкой, а не вместо неё. Без фото середина карточки
           оставалась большим пустым пятном: главное было прижато к верху,
           подробности к низу, а между ними полкарточки багрового ничего.
           Буква заполняет провал и даёт карточке лицо. */
        <span className="swipe-initial swipe-initial-ghost">{initial}</span>
      ) : (
        <span className="swipe-initial">{initial}</span>
      )}
      {src && state === "load" && <div className="photo-shimmer" />}
      {src && state !== "err" && (
        <img
          src={src}
          alt=""
          className="swipe-img"
          style={{ opacity: state === "ok" ? 1 : 0 }}
          onLoad={() => setState("ok")}
          onError={() => setState("err")}
        />
      )}
    </div>
  );
}

/** Кнопка-закладка прямо на свайп-карточке. stopPropagation на pointerdown —
 *  чтобы тап по закладке не запускал жест свайпа. */
function CardFavButton({ id, top = true }: { id: string; top?: boolean }) {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["fav-ids"], queryFn: listFavoriteIds });
  const saved = (data ?? []).includes(id);
  async function toggle(e: MouseEvent) {
    e.stopPropagation();
    haptic("light");
    try {
      if (saved) await removeFavorite(id);
      else await addFavorite(id);
      qc.invalidateQueries({ queryKey: ["fav-ids"] });
      qc.invalidateQueries({ queryKey: ["favorites"] });
      toast(saved ? "Убрано из избранного" : "Сохранено в избранное", "success");
    } catch {
      toast("Смена не сохранилась. Попробуйте ещё раз", "error");
    }
  }
  return (
    <button
      aria-label={saved ? "Убрать из избранного" : "В избранное"}
      aria-pressed={saved}
      // Закладка нижней карточки — тоже вне порядка обхода: сохранять смену,
      // которую не видишь, незачем.
      tabIndex={top ? 0 : -1}
      aria-hidden={!top}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={toggle}
      // Подложка — из класса .glass, как у соседних плашек «350 ₽/час» и
      // «1,6 км». Раньше она была вписана числами и осталась на старом,
      // отвергнутом значении 0.45: поверх светлого фото закладка выходила
      // заметно бледнее соседей, и верхний ряд карточки выглядел собранным
      // из двух разных материалов.
      className="glass"
      style={{
        width: 44,
        height: 44,
        padding: 0,
        borderRadius: "50%",
        color: saved ? "var(--super)" : "var(--on-dark)",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
      }}
    >
      <IconBookmark size={18} filled={saved} />
    </button>
  );
}

/** Золотой бейдж-галочка «проверено» — единый знак доверия (бренд-цвет).
 *
 *  Галочка ТЁМНАЯ: белая на золоте давала 2.6:1 в светлой теме и 1.9:1 в
 *  тёмной — знак доверия превращался в жёлтый кружок без содержимого.
 *  Название читается вслух: `title` на телефоне не показывается вовсе. */
function VerifiedDot({ size = 20, title }: { size?: number; title: string }) {
  return (
    <span
      role="img"
      aria-label={title}
      title={title}
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: "var(--super)",
        color: "var(--on-gold)",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        flex: "none",
      }}
    >
      <IconCheck size={size * 0.62} />
    </span>
  );
}

/** «Подробнее» — настоящая кнопка, а не подпись.
 *
 *  Раньше здесь стояла подпись «коснитесь карточки», спрятанная от чтения
 *  вслух: она объясняла жест зрячему и ничего не давала остальным. Переворот
 *  висел только на нажатии по карточке, а карточка — div без роли и без места
 *  в порядке табуляции. Человек с клавиатурой или экранным диктором не мог
 *  открыть подробности вовсе, хотя именно там адрес, разбивка оплаты и
 *  предупреждение про деньги вперёд.
 *
 *  stopPropagation обязателен: нажатие всплывает до карточки, а та по нажатию
 *  переворачивается — кнопка сработала бы и тут же отменила сама себя. Ровно
 *  на этом уже спотыкалась кнопка «Назад» на изнанке.
 */
function DetailsButton({ label, onOpen, top = true }: {
  label: string;
  onOpen?: () => void;
  /** Верхняя ли карточка. У нижних кнопка остаётся на месте — их край видно, —
   *  но из порядка обхода уходит: клавишей нельзя попасть в карточку, которой
   *  не видишь. */
  top?: boolean;
}) {
  if (!onOpen) return null;
  return (
    <button
      type="button"
      className="swipe-more"
      aria-label={label}
      tabIndex={top ? 0 : -1}
      aria-hidden={!top}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        onOpen();
      }}
    >
      Подробнее
    </button>
  );
}

export function VacancyCardContent({ v, onDetails, top = true }: {
  v: Vacancy;
  onDetails?: () => void;
  top?: boolean;
}) {
  const urgent = isUrgentShift(v.date);
  const hasPhoto = !!v.interiorPhotoUrl;
  const PayGlyph = v.payMethod ? PAY_ICON[v.payMethod] : null;
  // Когда фото нет, сумма уже написана крупно поверх карточки — и повторялась
  // строкой «≈ 2 800 ₽ за смену» на три сантиметра ниже. Два одинаковых числа
  // на одном экране заставляют сверять, не разные ли они.
  const [heroShown, setHeroShown] = useState(!hasPhoto);
  // В крупном режиме крупной суммы поверх карточки нет: весь текст и так
  // больше, и она перестаёт помещаться вместе с названием и условиями. Сумма
  // при этом не пропадает — она возвращается обычной строкой в теле карточки.
  const large = useLargeMode();
  const short = useShortScreen();
  return (
    <>
      <SwipePhoto
        src={hasPhoto ? v.interiorPhotoUrl : undefined}
        initial={(v.companyName || "С").charAt(0)}
        onHero={setHeroShown}
        hasHero={!large && !short}
      />
      <div className="swipe-shade" />

      {/* Плашки и крупная сумма — в ОДНОЙ колонке, друг под другом.
          Раньше сумма стояла на фиксированной высоте от верха карточки, и
          стоило ряду плашек перенестись на вторую строку (длинный район,
          крупный режим для слабого зрения) — плашки наезжали прямо на сумму.
          Теперь они не могут пересечься в принципе: это обычный поток. */}
      <div className="swipe-top">
        {/* верхний ряд: ставка слева, срочность/дистанция справа — без лишнего */}
        <div className="row" style={{ gap: 8, flexWrap: "wrap", rowGap: 8 }}>
        {/* Ставка в час. На низком экране прячется (класс swipe-rate): ряд
            плашек переносился на вторую строку и отнимал у карточки 43 точки,
            а сумма за смену всё равно написана ниже — и она понятнее.

            Только для почасовой: при оплате за смену плашка показывала ровно
            то же число, что и крупная сумма под ней («4 500 ₽/смена» и «4 500
            ₽ за смену»), и человек начинал сверять, не разные ли это деньги. */}
        {v.rateType === "perHour" && (
          <span className="glass swipe-rate">
            <IconMoney size={14} /> {rateLabel(v.rate, v.rateType)}
          </span>
        )}
        {/* Закладка — единственная кнопка на карточке, и та второстепенная.
            Круглая кнопка «Детали смены» отсюда убрана: подробности
            открываются касанием самой карточки. Свайп — главное действие, и
            всё, что стоит рядом с ним крупной кнопкой, с ним соперничает. */}
        <CardFavButton id={v.id} top={top} />
        <span className="spacer" />
        {urgent ? (
          <span className="glass pulse" style={{ background: "var(--gold-fill)" }}>
            <IconFire size={13} /> Сегодня
          </span>
        ) : null}
        {typeof v.distanceKm === "number" && (
          <span className="glass">
            <IconPin size={13} /> {distance(v.distanceKm)}
          </span>
        )}
        </div>
        {heroShown && (
          <div className="swipe-hero">
            <div className="swipe-hero-sum is-num">
              {estimatedPay(v).toLocaleString("ru-RU")}
              <span className="rub">₽</span>
            </div>
            {/* Только «за смену»: день и часы стоят строкой ниже вместе,
                а у сегодняшней смены он был напечатан ещё и плашкой сверху —
                три раза одно слово на одной карточке. */}
            <div className="swipe-hero-cap">за смену</div>
          </div>
        )}
      </div>

      <div className="swipe-body">
        <div className="row" style={{ marginBottom: 8, gap: 6, flexWrap: "wrap" }}>
          <span className="tag tag-gold-fill">
            {STAFF_ROLE_LABELS[v.role]}
          </span>
        </div>

        <div className="swipe-title">
          <span style={{ minWidth: 0, overflowWrap: "anywhere" }}>{v.companyName}</span>
          {v.employerVerified && <VerifiedDot title="Проверенное заведение" />}
        </div>

        {/* Сколько заплатят — сразу под названием, а не последней строкой
            карточки. Когда текста много (длинное описание, крупный режим для
            слабого зрения), низ карточки обрезается — и обрезалось ровно то
            число, ради которого человек её и открыл. */}
        {!heroShown && (
          <div style={{
            marginTop: 4, fontWeight: 800, fontSize: "var(--text-md)",
            fontVariantNumeric: "tabular-nums",
          }}>
            {v.rateType === "perShift" ? "" : "≈ "}
            {money(estimatedPay(v))} за смену
          </div>
        )}

        <div className="card-meta">
          <div>
            <IconCalendar size={15} /> {shiftDayLabel(v.date)} · {fmtTime(v.startTime)}–{fmtTime(v.endTime)}
          </div>
          {(v.employerShiftsDone || v.employerRating) ? (
            // Отдельный класс: на самом маленьком экране в крупном режиме эта
            // строка уходит первой. Рейтинг заведения полезен, но адрес, часы
            // и медкнижка решают, ехать ли вообще, — они важнее.
            <div className="card-meta-trust">
              {/* Прочерк вместо оценки читался как «ноль». У заведения без
                  оценок просто не показываем звезду — закрытые смены говорят
                  сами за себя. */}
              {!!v.employerRating && (
                <>
                  <IconStar size={14} /> {dec1(v.employerRating)}
                  {v.employerShiftsDone ? " · " : ""}
                </>
              )}
              {v.employerShiftsDone
                ? `${v.employerShiftsDone} ${plural(v.employerShiftsDone, "смена", "смены", "смен")} ${plural(v.employerShiftsDone, "закрыта", "закрыто", "закрыто")}`
                : ""}
            </div>
          ) : null}
        </div>



        {/* Две ровные колонки вместо ряда с переносом. Раньше плашки были
            разной ширины и вставали по-разному на каждой карточке: у одной
            смены «медкнижка» уезжала на вторую строку, у соседней — нет,
            и лента выглядела дёрганой при листании. */}
        <div className="swipe-cond">
          {PayGlyph && v.payMethod && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "var(--super)", fontWeight: 700 }}>
              <PayGlyph size={16} /> {PAY_METHOD_SHORT[v.payMethod]}
            </span>
          )}
          {/* Чаевые ушли в шторку: их платят гости, а не заведение, и на
              решение «ехать или нет» они не влияют. Способ оплаты остался —
              «когда деньги» решает. */}
          {v.requireMedBook && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5, opacity: 0.9 }}>
              <IconMedBook size={15} /> Медкнижка
            </span>
          )}
          {/* Набор на несколько человек: без этой строки соискатель думает,
              что место одно, и не откликается «наверняка уже заняли». */}
          {/* Та же фраза, что в списке: вид переключается кнопкой в шапке,
              и по одной смене человек видел то «набрано 3 из 4», то «свободно
              1» — чтобы понять, что это одно и то же, надо вычесть в уме. */}
          {!!slotsLabel(v.headcount, v.slotsLeft) && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontWeight: 700 }}>
              {slotsLabel(v.headcount, v.slotsLeft)}
            </span>
          )}
        </div>

        {/* Адрес, описание и чаевые с лицевой стороны убраны — они дословно
            повторялись в шторке деталей, которая открывается по касанию. Пока
            шторки не было, карточка оставалась единственным местом, и держать
            всё на ней было правильно. Теперь это семь строк текста там, где
            решение принимают за три секунды: сколько платят, кем, когда и где
            примерно. Остальное — на касание.

            Строка-подсказка нужна ровно потому, что снаружи не видно: у
            карточки есть изнанка. Без неё человек не узнает, что адрес и
            описание вообще существуют. */}
        <DetailsButton label="Подробнее о смене" onOpen={onDetails} top={top} />

      </div>
    </>
  );
}

export function SeekerCardContent({ s, onDetails, top = true }: {
  s: Seeker;
  onDetails?: () => void;
  top?: boolean;
}) {
  const age = s.age ?? null;
  const roles = s.roles ?? [];
  const photos = s.photoUrls ?? [];
  const hasPhoto = !!photos[0];
  const allTags = s.experienceTags ?? [];
  // «Опытный» — по указанному опыту работника (мы не проверяем документы).
  const experienced = allTags.includes("experienced");
  const [heroShown, setHeroShown] = useState(!hasPhoto);
  const large = useLargeMode();
  const short = useShortScreen();
  return (
    <>
      <SwipePhoto
        src={hasPhoto ? photos[0] : undefined}
        initial={(s.name || "?").charAt(0)}
        onHero={setHeroShown}
        hasHero={!large && !short}
      />
      <div className="swipe-shade" />
      {/* Плашки и крупная должность — в одной колонке, друг под другом: так
          они не могут наехать друг на друга, даже если плашки перенесутся на
          вторую строку (длинное название, крупный режим). Раньше ряду
          запрещали переноситься именно поэтому. */}
      <div className="swipe-top">
        <div className="row" style={{ gap: 8, flexWrap: "wrap", rowGap: 8 }}>
        <span className="glass" style={{ flex: "none" }}><Rating value={s.rating} /></span>
        {s.availableToday && (
          // Тёмный текст на золоте. Белый по золоту давал контраст 2.3:1 —
          // самая заметная плашка карточки читалась хуже всего остального.
          <span className="glass pulse" style={{ background: "var(--super)", color: "var(--on-gold)", flex: "none", whiteSpace: "nowrap" }}>
            <IconBolt size={13} /> Может сегодня
          </span>
        )}
        <span className="spacer" />
        </div>
        {heroShown && (
          <div className="swipe-hero">
            <div className="swipe-hero-sum" style={{ fontSize: "var(--text-display)" }}>
              {roles.length > 0 ? STAFF_ROLE_LABELS[roles[0]] : "Готов выйти"}
            </div>
            {/* Главный вопрос заведения — можно ли на человека положиться.
                Раньше подпись под должностью была пустой у всех, кто уже
                работал, а надёжность лежала в самом низу карточки мелким
                текстом. Теперь она прямо под должностью. */}
            <div className="swipe-hero-cap">
              {s.shiftsTotal ? (
                <>
                  {reliabilityText(s.shiftsTotal, s.shiftsAttended, s.employersTotal)}
                </>
              ) : (
                // Пусто: плашка «Новичок» в верхнем ряду уже сказала это, а
                // здесь место под надёжность, которой у новичка нет.
                ""
              )}
            </div>
          </div>
        )}
      </div>
      <div className="swipe-body">
        <div className="swipe-title">
          <span style={{ minWidth: 0, overflowWrap: "anywhere" }}>
            {s.name}{age !== null ? `, ${age}` : ""}
          </span>
          {experienced && (
            <span className="tag tag-super">
              Опытный
            </span>
          )}
          {/* «Самозанятый» ушёл в шторку, к медкнижке. На карточке он вставал
              третьей плашкой в строке с именем, не помещался и переносился на
              отдельную строку — а решает заведение не этим. Как платить
              самозанятому, важно ПОСЛЕ выбора человека, а не вместо. */}
        </div>
        {/* Должность из заголовка карточки не повторяем — только остальные,
            которыми человек тоже готов выйти.

            Заливкой их красить нельзя: крупно написано «Бариста», а под ним
            такой же яркой плашкой «Официант» — и заведение видит две должности
            одного веса, не понимая, кто перед ним. Дополнительные должности —
            тихой плашкой без заливки: главная остаётся одна. */}
        {(heroShown ? roles.slice(1) : roles).length > 0 && (
          <div className="row" style={{ marginTop: 8, gap: 6, flexWrap: "wrap" }}>
            {(heroShown ? roles.slice(1) : roles).map((r) => (
              <span key={r} className={heroShown ? "tag" : "tag tag-gold-fill"}>
                {STAFF_ROLE_LABELS[r]}
              </span>
            ))}
          </div>
        )}

        <div className="card-meta">
          {!heroShown && !!s.shiftsTotal && s.shiftsTotal > 0 && (
            <div style={{ color: "var(--super)", fontWeight: 700 }}>
              <IconCheck size={15} />{" "}
              {reliabilityText(s.shiftsTotal, s.shiftsAttended, s.employersTotal)}
            </div>
          )}
          {s.district && (
            <div>
              <IconPin size={15} /> {s.district}
            </div>
          )}
          <div>
            <IconMedBook size={15} /> Медкнижка: {MED_BOOK_LABELS[s.medBook]}
          </div>
        </div>

        {/* Рассказ о себе и перечень умений ушли в шторку — она открывается
            касанием карточки. На лицевой стороне остаётся то, чем выбирают:
            кто это, кем готов выйти, можно ли положиться, есть ли медкнижка и
            откуда поедет. Рассказ о себе — свободный текст любой длины, и
            именно он превращал карточку в стену.

            Подсказка обязательна: снаружи не видно, что у карточки есть
            изнанка. Ровно та же строка, что и на карточке смены. */}
        <DetailsButton label="Подробнее о человеке" onOpen={onDetails} top={top} />
      </div>
    </>
  );
}
