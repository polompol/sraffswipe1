import { useEffect, useRef, useState } from "react";
import { useSprings, animated, to, type SpringValue } from "@react-spring/web";
import { useDrag } from "@use-gesture/react";
import type { SwipeDirection } from "@/types/domain";
import { haptic } from "@/telegram/sdk";
import { LS } from "@/lib/storage";

interface Props<T> {
  items: T[];
  keyOf: (item: T) => string;
  /** Лицевая сторона. Получает `open` — открыть подробности.
   *
   *  Ручка нужна ради тех, кто не может коснуться экрана. Переворот висел
   *  только на нажатии по самой карточке, а карточка — это div: у неё нет ни
   *  роли кнопки, ни места в порядке табуляции. Человек с клавиатурой или
   *  переключателем не мог открыть подробности вовсе — а там адрес, разбивка
   *  оплаты и предупреждение про деньги вперёд. */
  renderCard: (
    item: T,
    controls: {
      open: () => void;
      /** Верхняя ли это карточка. Под ней лежат ещё две — их видно краем, но
       *  действовать можно только с верхней: и свайп, и круглые кнопки берут
       *  её. Кнопки нижних карточек надо убирать из порядка обхода, иначе
       *  клавишей человек уходит в карточку, которой не видит, и открывает
       *  подробности неизвестно чего. */
      top: boolean;
    },
  ) => React.ReactNode;
  /** Может вернуть промис: если он отклонится, карточка вернётся в колоду. */
  onSwipe: (item: T, dir: SwipeDirection) => void | Promise<unknown>;
  onEmpty?: () => void;
  /** Управление верхней картой снаружи (кнопки «Пропустить/Отклик», шторка
   *  деталей). expectKey — страховка: смахнуть именно ту карточку, которую
   *  человек видел, а не ту, что оказалась сверху, пока была открыта шторка. */
  controllerRef?: (
    fn: (dir: SwipeDirection, expectKey?: string) => void,
  ) => void;
  /** Изнанка карточки — «расскажи подробнее». Касание переворачивает.
   *
   *  Получает `close` — вернуть карточку лицом. Решений изнанка не принимает:
   *  и «да», и «нет» живут на лицевой стороне, иначе выходила кривая пара —
   *  согласиться с изнанки можно, а отказаться нет.
   *
   *  Состоянием переворота владеет колода: отдать его наружу значило бы завести
   *  второй источник правды о том, какая карточка сейчас перевёрнута. */
  renderBack: (item: T, controls: { close: () => void }) => React.ReactNode;
  /** Перевёрнута ли сейчас какая-нибудь карточка. Нужно наружу, потому что
   *  кнопки «Пропустить/Отклик» лежат ПОВЕРХ карточки, но живут вне колоды:
   *  их белые подписи рассчитаны на тёмную лицевую сторону и на светлой
   *  изнанке пропадали совсем. */
  onFlipChange?: (flipped: boolean) => void;
  /** Слово на штампе при свайпе вправо. У соискателя «ХОЧУ», у заведения
   *  «ЗОВУ»: один штамп на обе стороны ложился поперёк лица человека и
   *  расходился с кнопкой под колодой, которая подписана «Позвать». */
  likeStamp?: string;
}

const VISIBLE = 3;

// Свайп вбок: вправо — отклик, влево — пропустить. Свайпа вверх больше нет
// (им отправляли супер-лайк «Срочно»), поэтому вертикаль карточку не двигает.
function dirFrom(mx: number, sx: number): SwipeDirection {
  if (sx !== 0) return sx > 0 ? "like" : "dislike";
  return mx > 0 ? "like" : "dislike";
}

export function SwipeDeck<T>(props: Props<T>) {
  const { items, renderCard, onSwipe, keyOf, likeStamp = "ХОЧУ" } = props;
  // Улетевшие карточки помним ПО НОМЕРУ, но сбрасываем при смене набора.
  // Раньше номера жили вечно: человек свайпал две карточки, менял город — и
  // первые две смены нового города считались уже просмотренными. Он их не
  // видел никогда и не мог понять почему.
  const [gone] = useState(() => new Set<number>());
  // Карточки, по которым сервер УЖЕ ответил согласием. Отдельно от `gone`:
  // туда карточка попадает сразу, ещё до ответа, — иначе она бы вернулась под
  // палец прямо во время анимации. Из-за этой разницы «смены закончились»
  // могло сработать раньше времени: человек быстро смахивает две последние
  // карточки, первая проходит, вторая получает отказ — и на момент ответа по
  // первой в `gone` уже лежат обе. Экран объявлял, что смен нет, а вторая
  // карточка через мгновение возвращалась в пустую колоду.
  const [settled] = useState(() => new Set<number>());
  // Тащили ли карточку в текущем жесте (см. handleClick ниже).
  const draggedRef = useRef(false);
  // Какая карточка перевёрнута — по ключу, а не по номеру. Номер сдвигается,
  // когда соседняя карточка улетает, и перевёрнутой оказалась бы следующая.
  const [flipped, setFlipped] = useState<string | null>(null);
  // Тот же переворот, но доступный из таймеров подсказки: они заведены один
  // раз при появлении колоды и внутри видели бы состояние первого кадра.
  const flippedRef = useRef<string | null>(null);
  flippedRef.current = flipped;
  const onFlipChange = props.onFlipChange;
  useEffect(() => {
    onFlipChange?.(flipped !== null);
  }, [flipped, onFlipChange]);
  const deckKey = items.map((it) => keyOf(it)).join("|");
  const lastDeck = useRef(deckKey);
  if (lastDeck.current !== deckKey) {
    lastDeck.current = deckKey;
    gone.clear();
    settled.clear();
    // Перевёрнутой карточки в новой колоде нет: иначе первая же карточка
    // другого города открывалась бы изнанкой.
    if (flipped !== null) setFlipped(null);
  }

  const [springs, apiRef] = useSprings(items.length, (i) => ({
    x: 0,
    y: 0,
    rot: 0,
    scale: i < VISIBLE ? 1 - i * 0.04 : 0.88,
    yStack: Math.min(i, VISIBLE) * 12,
  }));

  function fling(index: number, dir: SwipeDirection) {
    if (gone.has(index)) return;
    // Решение принято — карточка улетает лицом, а не изнанкой. Иначе
    // следующая за ней встречала бы человека перевёрнутой.
    if (flipped === keyOf(items[index])) setFlipped(null);
    gone.add(index);
    haptic(dir === "dislike" ? "light" : "medium");
    const dx = dir === "dislike" ? -1 : 1;
    apiRef.start((i) => {
      if (i !== index) return {};
      return {
        x: (200 + window.innerWidth) * dx,
        y: 0,
        rot: dx * 18,
        config: { tension: 200, friction: 28 },
      };
    });
    // Возврат карточки, если сервер отказал. Раньше она улетала сразу и
    // насовсем: человек видел ошибку («смена уже занята», «оплатите счёт»),
    // а смена исчезала из колоды — вернуться к ней было нельзя ничем.
    const back = () => {
      gone.delete(index);
      settled.delete(index);
      apiRef.start((i) => (i === index
        ? { x: 0, y: 0, rot: 0, config: { tension: 220, friction: 26 } }
        : {}));
      restack();
    };
    // «Смены закончились» объявляем только ПОСЛЕ ответа сервера и только по
    // тем карточкам, на которые сервер ответил согласием.
    //
    // Раньше это делалось сразу, вместе с анимацией. На последней карточке
    // получалось так: человек смахнул, сервер отказал («место уже заняли»,
    // «оплатите счёт»), карточка честно вернулась в колоду — а экран уже
    // сообщил, что смен больше нет, и показал пустое состояние поверх
    // вернувшейся карточки.
    const done = () => {
      settled.add(index);
      if (settled.size === items.length) props.onEmpty?.();
    };
    const res = onSwipe(items[index], dir) as unknown;
    if (res && typeof (res as Promise<unknown>).then === "function") {
      (res as Promise<unknown>).then(done, back);
    } else {
      done();
    }
    restack();
  }

  // Пересобрать стопку: оставшиеся карты подрастают к фронту (живее).
  function restack() {
    let pos = 0;
    apiRef.start((i) => {
      if (gone.has(i)) return {};
      const p = pos++;
      return {
        scale: Math.max(0.88, 1 - p * 0.04),
        yStack: Math.min(p, VISIBLE) * 12,
        config: { tension: 320, friction: 30 },
      };
    });
  }

  // Кнопки управляют ВЕРХНЕЙ картой (i=0 — самый высокий z-index/фронт).
  if (props.controllerRef) {
    props.controllerRef((dir, expectKey) => {
      for (let i = 0; i < items.length; i++) {
        if (!gone.has(i)) {
          // Ждали конкретную карточку, а сверху уже другая — не трогаем её.
          if (expectKey !== undefined && keyOf(items[i]) !== expectKey) return;
          fling(i, dir);
          break;
        }
      }
    });
  }

  // Одноразовая деликатная подсказка: верхняя карта чуть кивает вправо и
  // возвращается — показывает, что её можно свайпать (удобно для новичков
  // любого возраста). Уважает prefers-reduced-motion (через глобальный CSS).
  useEffect(() => {
    if (localStorage.getItem(LS.swipeHinted)) return;
    localStorage.setItem(LS.swipeHinted, "1");
    const nudge = (x: number) =>
      apiRef.start((i) =>
        // Перевёрнутую карточку не качаем: подсказка показывает жест свайпа,
        // а с изнанки свайп запрещён — кивок обещал бы то, чего нельзя.
        i === 0 && !gone.has(0) && flippedRef.current === null
          ? { x, rot: x / 18, config: { tension: 180, friction: 18 } }
          : {},
      );
    const t1 = setTimeout(() => nudge(44), 550);
    const t2 = setTimeout(() => nudge(0), 1080);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [apiRef, gone]);

  const bind = useDrag(
    ({ args: [index], active, movement: [mx, my], swipe: [sx], first, last }) => {
      // Сбрасываем в НАЧАЛЕ жеста, а не только в handleClick. Флаг «тащили»
      // гасит следующее касание, чтобы неудачный свайп не считался тапом. Но
      // снимался он лишь по клику, а браузер после длинного перетаскивания
      // клик не всегда шлёт — флаг оставался поднятым, и следующее настоящее
      // касание карточка глотала молча.
      if (first) draggedRef.current = false;
      // Перевёрнутую карточку не тащим. На изнанке текст прокручивается, и
      // тот же жест не может значить одновременно «читаю дальше» и «смахиваю».
      // Решить можно и с изнанки — кнопками под колодой, они работают всегда.
      if (flipped !== null && flipped === keyOf(items[index as number])) return;
      // Запоминаем, тащили карточку или только коснулись: по этому потом
      // отличаем «расскажи подробнее» от неудачного свайпа. Само нажатие
      // ловим обычным onClick — так предсказуемее, чем распознавание тапа
      // внутри жеста.
      if (Math.abs(mx) > 6 || Math.abs(my) > 6) draggedRef.current = true;
      // Триггер: длинный свайп вбок ИЛИ быстрый флик (swipe от use-gesture).
      const trigger = sx !== 0 || Math.abs(mx) > 110;
      if (last && trigger) {
        fling(index as number, dirFrom(mx, sx));
        return;
      }
      apiRef.start((i) => {
        if (i !== (index as number)) return {};
        return {
          x: active ? mx : 0,
          y: active ? my : 0,
          rot: active ? mx / 18 : 0,
          scale: 1,
            config: { tension: 350, friction: 32 },
        };
      });
    },
    { filterTaps: true },
  );

  /** Нажатие по карточке — «расскажи подробнее». После перетаскивания не
   *  срабатывает: иначе каждый неудачный свайп открывал бы шторку. */
  function handleClick(item: T): void {
    const dragged = draggedRef.current;
    draggedRef.current = false;
    if (dragged) return;
    const key = keyOf(item);
    setFlipped((cur) => (cur === key ? null : key));
    haptic("light");
  }

  const topIndex = items.findIndex((_, i) => !gone.has(i));

  return (
    <div className="deck">
      {springs.map((style, i) => {
        // Верхняя — первая неулетевшая. Именно её берут кнопки под колодой,
        // и только её содержимое должно попадать под клавишу Tab.
        if (gone.has(i)) return null;
        const item = items[i];
        const isFlipped = flipped === keyOf(item);
        return (
          <animated.div
            key={keyOf(item)}
            className={isFlipped ? "swipe-card is-flipped" : "swipe-card"}
            {...bind(i)}
            onClick={() => handleClick(item)}
            style={{
              transform: to(
                [style.x, style.y, style.yStack, style.rot, style.scale],
                (x, y, ys, r, s) =>
                  `translate3d(${x}px,${(y as number) + (ys as number)}px,0) rotate(${r}deg) scale(${s})`,
              ),
              zIndex: items.length - i,
            }}
          >
            <div
              className="flip"
              style={{ transform: `rotateY(${isFlipped ? 180 : 0}deg)` }}
            >
                {/* aria-hidden на невидимой стороне обязателен: без него
                    незрячий человек слышит обе стороны подряд как один
                    сплошной текст и не понимает, где он находится. */}
              <div className="flip-face flip-front" aria-hidden={isFlipped}>
                {renderCard(item, {
                  open: () => setFlipped(keyOf(item)),
                  top: i === topIndex,
                })}
              </div>
              <div className="flip-face flip-back" aria-hidden={!isFlipped}>
                {props.renderBack(item, { close: () => setFlipped(null) })}
              </div>
            </div>
            <Tint x={style.x} />
            <Stamps x={style.x} like={likeStamp} />
          </animated.div>
        );
      })}
    </div>
  );
}

/** Цветовая подсветка карточки при свайпе: кримсон вправо, серый влево. */
function Tint({ x }: { x: SpringValue<number> }) {
  return (
    <>
      <animated.div
        className="swipe-tint"
        style={{
          background: "var(--like)",
          opacity: to(x, (v) => Math.max(0, Math.min(0.32, v / 260))),
        }}
      />
      <animated.div
        className="swipe-tint"
        style={{
          background: "var(--dislike)",
          opacity: to(x, (v) => Math.max(0, Math.min(0.4, -v / 260))),
        }}
      />
    </>
  );
}

function Stamps({ x, like }: { x: SpringValue<number>; like: string }) {
  return (
    <>
      <animated.div
        className="stamp"
        style={{
          left: 20,
          color: "var(--like)",
          transform: "rotate(-12deg)",
          opacity: to(x, (v) => Math.max(0, Math.min(1, v / 80))),
        }}
      >
        {like}
      </animated.div>
      <animated.div
        className="stamp"
        style={{
          right: 20,
          color: "var(--dislike)",
          transform: "rotate(12deg)",
          opacity: to(x, (v) => Math.max(0, Math.min(1, -v / 80))),
        }}
      >
        НЕТ
      </animated.div>
    </>
  );
}
