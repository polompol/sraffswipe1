import { useEffect, useRef, useState } from "react";
import { useSprings, animated, to, type SpringValue } from "@react-spring/web";
import { useDrag } from "@use-gesture/react";
import type { SwipeDirection } from "@/types/domain";
import { haptic } from "@/telegram/sdk";

interface Props<T> {
  items: T[];
  keyOf: (item: T) => string;
  renderCard: (item: T) => React.ReactNode;
  /** Может вернуть промис: если он отклонится, карточка вернётся в колоду. */
  onSwipe: (item: T, dir: SwipeDirection) => void | Promise<unknown>;
  onEmpty?: () => void;
  /** Управление верхней картой снаружи (кнопки «Пропустить/Отклик», шторка
   *  деталей). expectKey — страховка: смахнуть именно ту карточку, которую
   *  человек видел, а не ту, что оказалась сверху, пока была открыта шторка. */
  controllerRef?: (
    fn: (dir: SwipeDirection, expectKey?: string) => void,
  ) => void;
}

const VISIBLE = 3;

// Свайп вбок: вправо — отклик, влево — пропустить. Свайпа вверх больше нет
// (им отправляли супер-лайк «Срочно»), поэтому вертикаль карточку не двигает.
function dirFrom(mx: number, sx: number): SwipeDirection {
  if (sx !== 0) return sx > 0 ? "like" : "dislike";
  return mx > 0 ? "like" : "dislike";
}

export function SwipeDeck<T>(props: Props<T>) {
  const { items, renderCard, onSwipe, keyOf } = props;
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
  const deckKey = items.map((it) => keyOf(it)).join("|");
  const lastDeck = useRef(deckKey);
  if (lastDeck.current !== deckKey) {
    lastDeck.current = deckKey;
    gone.clear();
    settled.clear();
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
    if (localStorage.getItem("ss_swipe_hinted")) return;
    localStorage.setItem("ss_swipe_hinted", "1");
    const nudge = (x: number) =>
      apiRef.start((i) =>
        i === 0 && !gone.has(0)
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
    ({ args: [index], active, movement: [mx, my], swipe: [sx], last }) => {
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
  );

  return (
    <div className="deck">
      {springs.map((style, i) => {
        if (gone.has(i)) return null;
        const item = items[i];
        return (
          <animated.div
            key={keyOf(item)}
            className="swipe-card"
            {...bind(i)}
            style={{
              transform: to(
                [style.x, style.y, style.yStack, style.rot, style.scale],
                (x, y, ys, r, s) =>
                  `translate3d(${x}px,${(y as number) + (ys as number)}px,0) rotate(${r}deg) scale(${s})`,
              ),
              zIndex: items.length - i,
            }}
          >
            {renderCard(item)}
            <Tint x={style.x} />
            <Stamps x={style.x} />
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

function Stamps({ x }: { x: SpringValue<number> }) {
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
        ХОЧУ
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
