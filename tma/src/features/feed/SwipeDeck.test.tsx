// @vitest-environment jsdom
/**
 * Колода: «смены закончились» — только после ответа сервера.
 *
 * На последней карточке это ломалось: человек смахивал, сервер отказывал
 * («место уже заняли», «оплатите счёт»), карточка честно возвращалась в
 * колоду — а экран уже говорил, что смен больше нет. Человек видел пустоту
 * там, где на самом деле лежала доступная смена.
 */
import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SwipeDeck } from "./SwipeDeck";

type Card = { id: string };

function setup(onSwipe: (item: Card) => Promise<boolean>) {
  const onEmpty = vi.fn();
  let fire: ((dir: "like" | "dislike") => void) | null = null;
  render(
    <SwipeDeck<Card>
      items={[{ id: "one" }]}
      keyOf={(c) => c.id}
      onSwipe={(item) => onSwipe(item)}
      onEmpty={onEmpty}
      controllerRef={(fn) => (fire = fn)}
      renderCard={(c) => <div>{c.id}</div>}
      renderBack={(c) => <div>изнанка {c.id}</div>}
    />,
  );
  return { onEmpty, swipe: () => fire?.("like") };
}

/** Колода из нескольких карточек — чтобы смахнуть подряд, не дожидаясь ответа. */
function setupMany(
  ids: string[],
  onSwipe: (item: Card) => Promise<unknown>,
) {
  const onEmpty = vi.fn();
  let fire: ((dir: "like" | "dislike") => void) | null = null;
  render(
    <SwipeDeck<Card>
      items={ids.map((id) => ({ id }))}
      keyOf={(c) => c.id}
      onSwipe={(item) => onSwipe(item)}
      onEmpty={onEmpty}
      controllerRef={(fn) => (fire = fn)}
      renderCard={(c) => <div>{c.id}</div>}
      renderBack={(c) => <div>изнанка {c.id}</div>}
    />,
  );
  return { onEmpty, swipe: () => fire?.("like") };
}

// Между тестами прибираемся сами: авто-очистки в конфиге нет, и колоды от
// прошлых тестов остались бы в документе.
afterEach(cleanup);

describe("последняя карточка", () => {
  it("после отказа сервера пустое состояние не показывается", async () => {
    const { onEmpty, swipe } = setup(() => Promise.reject(new Error("занято")));
    swipe();
    // Даём промису отработать: колода должна вернуть карточку, а не объявить
    // ленту пустой.
    await new Promise((r) => setTimeout(r, 20));
    expect(onEmpty).not.toHaveBeenCalled();
  });

  it("после успешного отклика колода честно сообщает, что смен нет", async () => {
    const { onEmpty, swipe } = setup(() => Promise.resolve(true));
    swipe();
    await waitFor(() => expect(onEmpty).toHaveBeenCalledTimes(1));
  });
});

describe("два свайпа подряд, пока сервер думает", () => {
  it("отказ по второй карточке отменяет «смены закончились»", async () => {
    // Так и бывает на плохой связи: человек смахивает две последние карточки
    // одну за другой, ответ приходит с задержкой. Первая проходит, вторую
    // сервер не принимает — значит колода не пуста, в ней осталась одна смена.
    const answers = [
      Promise.resolve(true),
      Promise.reject(new Error("место уже заняли")),
    ];
    // Отказ ловим сразу, иначе Node ругается на «необработанный промис»
    // раньше, чем колода успеет его обработать.
    answers[1].catch(() => {});
    let n = 0;
    const { onEmpty, swipe } = setupMany(["one", "two"], () => answers[n++]);

    swipe();
    swipe();
    await new Promise((r) => setTimeout(r, 30));

    expect(n).toBe(2);
    expect(onEmpty).not.toHaveBeenCalled();
  });

  it("обе прошли — пустое состояние объявляется ровно один раз", async () => {
    let n = 0;
    const { onEmpty, swipe } = setupMany(["one", "two"], () => {
      n++;
      return Promise.resolve(true);
    });

    swipe();
    swipe();
    await waitFor(() => expect(onEmpty).toHaveBeenCalledTimes(1));
    expect(n).toBe(2);
  });
});
