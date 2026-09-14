// @vitest-environment jsdom
/** Запоздалый ответ старой колоды не может менять новую ленту. */
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SwipeDeck } from "./SwipeDeck";

type Card = { id: string };

function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((ok, fail) => {
    resolve = ok;
    reject = fail;
  });
  return { promise, resolve, reject };
}

function setup(onSwipe: (item: Card) => void | Promise<unknown>) {
  const onEmpty = vi.fn();
  let fire: (dir: "like" | "dislike") => void = () => {};
  const deck = (ids: string[]) => (
    <SwipeDeck<Card>
      items={ids.map((id) => ({ id }))}
      keyOf={(item) => item.id}
      onSwipe={onSwipe}
      onEmpty={onEmpty}
      controllerRef={(fn) => (fire = fn)}
      renderCard={(item) => <div>{item.id}</div>}
      renderBack={(item) => <div>Подробности {item.id}</div>}
    />
  );
  const view = render(deck(["first"]));
  return {
    onEmpty,
    swipe: () => act(() => fire("like")),
    setItems: (ids: string[]) => view.rerender(deck(ids)),
    unmount: view.unmount,
  };
}

afterEach(cleanup);

describe("ответы по прежней колоде", () => {
  it("старый успех не объявляет новую ленту пустой", async () => {
    const pending = deferred();
    const onSwipe = vi.fn((item: Card) =>
      item.id === "first" ? pending.promise : Promise.resolve(),
    );
    const ui = setup(onSwipe);
    ui.swipe();
    ui.setItems(["next"]);

    await act(async () => pending.resolve());
    expect(ui.onEmpty).not.toHaveBeenCalled();

    ui.swipe();
    await waitFor(() => expect(ui.onEmpty).toHaveBeenCalledTimes(1));
    expect(onSwipe).toHaveBeenCalledTimes(2);
  });

  it("старый отказ не разрешает повторный отклик по новой карточке", async () => {
    const first = deferred();
    const next = deferred();
    const onSwipe = vi.fn((item: Card) =>
      item.id === "first" ? first.promise : next.promise,
    );
    const ui = setup(onSwipe);
    ui.swipe();
    ui.setItems(["next"]);
    ui.swipe();

    await act(async () => first.reject(new Error("Старая смена занята")));
    ui.swipe();
    expect(onSwipe).toHaveBeenCalledTimes(2);
    expect(ui.onEmpty).not.toHaveBeenCalled();

    await act(async () => next.resolve());
    expect(ui.onEmpty).toHaveBeenCalledTimes(1);
  });

  it("возвращение к прежнему фильтру не оживляет его старые ответы", async () => {
    const pending = deferred();
    let attempts = 0;
    const onSwipe = vi.fn(() =>
      ++attempts === 1 ? pending.promise : Promise.resolve(),
    );
    const ui = setup(onSwipe);
    ui.swipe();
    ui.setItems(["next"]);
    ui.setItems(["first"]);

    await act(async () => pending.resolve());
    expect(ui.onEmpty).not.toHaveBeenCalled();

    ui.swipe();
    await waitFor(() => expect(ui.onEmpty).toHaveBeenCalledTimes(1));
    expect(onSwipe).toHaveBeenCalledTimes(2);
  });

  it("после ухода с экрана ответ не вызывает переход в пустую ленту", async () => {
    const pending = deferred();
    const ui = setup(() => pending.promise);
    ui.swipe();
    ui.unmount();

    await act(async () => pending.resolve());
    expect(ui.onEmpty).not.toHaveBeenCalled();
  });
});

it("синхронная ошибка возвращает карточку для повторного действия", async () => {
  let attempts = 0;
  const onSwipe = vi.fn(() => {
    attempts += 1;
    if (attempts === 1) throw new Error("Не удалось отправить");
    return Promise.resolve();
  });
  const ui = setup(onSwipe);

  expect(() => ui.swipe()).not.toThrow();
  expect(ui.onEmpty).not.toHaveBeenCalled();
  ui.swipe();
  await waitFor(() => expect(ui.onEmpty).toHaveBeenCalledTimes(1));
  expect(onSwipe).toHaveBeenCalledTimes(2);
});
