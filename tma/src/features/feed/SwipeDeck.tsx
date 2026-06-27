import { useState } from "react";
import { useSprings, animated, to, type SpringValue } from "@react-spring/web";
import { useDrag } from "@use-gesture/react";
import type { SwipeDirection } from "@/types/domain";
import { haptic } from "@/telegram/sdk";

interface Props<T> {
  items: T[];
  keyOf: (item: T) => string;
  renderCard: (item: T) => React.ReactNode;
  onSwipe: (item: T, dir: SwipeDirection) => void;
  onEmpty?: () => void;
  controllerRef?: (fn: (dir: SwipeDirection) => void) => void;
}

const VISIBLE = 3;

function dirFrom(mx: number, my: number, sx: number, sy: number): SwipeDirection {
  if (sy < 0 || (my < -80 && Math.abs(my) > Math.abs(mx))) return "superlike";
  if (sx !== 0) return sx > 0 ? "like" : "dislike";
  return mx > 0 ? "like" : "dislike";
}

export function SwipeDeck<T>(props: Props<T>) {
  const { items, renderCard, onSwipe, keyOf } = props;
  const [gone] = useState(() => new Set<number>());

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
    const dx = dir === "dislike" ? -1 : dir === "like" ? 1 : 0;
    const dy = dir === "superlike" ? -1 : 0;
    apiRef.start((i) => {
      if (i !== index) return {};
      return {
        x: (200 + window.innerWidth) * dx,
        y: dy ? -(200 + window.innerHeight) : 0,
        rot: dx * 18,
        config: { tension: 200, friction: 28 },
      };
    });
    onSwipe(items[index], dir);
    restack();
    if (gone.size === items.length) props.onEmpty?.();
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

  // Кнопки управляют верхней картой.
  if (props.controllerRef) {
    props.controllerRef((dir) => {
      for (let i = items.length - 1; i >= 0; i--) {
        if (!gone.has(i)) {
          fling(i, dir);
          break;
        }
      }
    });
  }

  const bind = useDrag(
    ({ args: [index], active, movement: [mx, my], swipe: [sx, sy], last }) => {
      // Триггер: длинный свайп ИЛИ быстрый флик (swipe от use-gesture).
      const trigger = sx !== 0 || sy !== 0 || Math.abs(mx) > 110 || my < -110;
      if (last && trigger) {
        fling(index as number, dirFrom(mx, my, sx, sy));
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
            <Stamps x={style.x} y={style.y} />
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
          background: "#3a342f",
          opacity: to(x, (v) => Math.max(0, Math.min(0.4, -v / 260))),
        }}
      />
    </>
  );
}

function Stamps({ x, y }: { x: SpringValue<number>; y: SpringValue<number> }) {
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
      <animated.div
        className="stamp"
        style={{
          left: "50%",
          marginLeft: -70,
          top: "auto",
          bottom: 90,
          color: "var(--super)",
          opacity: to(y, (v) => Math.max(0, Math.min(1, -v / 80))),
        }}
      >
        СРОЧНО
      </animated.div>
    </>
  );
}
