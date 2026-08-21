// @vitest-environment jsdom
/**
 * Колода: «смены закончились» — только после ответа сервера.
 *
 * На последней карточке это ломалось: человек смахивал, сервер отказывал
 * («место уже заняли», «оплатите счёт»), карточка честно возвращалась в
 * колоду — а экран уже говорил, что смен больше нет. Человек видел пустоту
 * там, где на самом деле лежала доступная смена.
 */
import { render, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
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
    />,
  );
  return { onEmpty, swipe: () => fire?.("like") };
}

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
