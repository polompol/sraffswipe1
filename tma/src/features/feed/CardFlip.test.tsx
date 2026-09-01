// @vitest-environment jsdom
/**
 * Переворот карточки.
 *
 * Подробности показывает вторая сторона самой карточки, а не шторка поверх
 * экрана. Проверяем не красоту, а три правила, на которых это держится:
 *
 * 1. Касание переворачивает и возвращает обратно.
 * 2. Невидимая сторона скрыта от чтения вслух — иначе незрячий человек слышит
 *    обе стороны подряд как один сплошной текст.
 * 3. Перевёрнутой оказывается ИМЕННО та карточка, которой коснулись.
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { SwipeDeck } from "./SwipeDeck";

type Card = { id: string };

function setup(ids = ["one", "two"]) {
  const { container } = render(
    <SwipeDeck<Card>
      items={ids.map((id) => ({ id }))}
      keyOf={(c) => c.id}
      onSwipe={() => Promise.resolve(true)}
      renderCard={(c) => <div>лицо {c.id}</div>}
      renderBack={(c) => <div>изнанка {c.id}</div>}
    />,
  );
  return container;
}

/** Сторона считается видимой, если её не спрятали от чтения вслух. */
function faceOf(container: Element, text: string): Element {
  const el = screen.getByText(text).closest(".flip-face");
  expect(el, `сторона «${text}» должна лежать на грани карточки`).toBeTruthy();
  expect(container.contains(el!)).toBe(true);
  return el!;
}

afterEach(cleanup);

describe("перевёртыш", () => {
  it("касание переворачивает, повторное — возвращает", () => {
    const c = setup(["one"]);
    const card = c.querySelector(".swipe-card")!;

    expect(card.classList.contains("is-flipped")).toBe(false);
    fireEvent.click(card);
    expect(card.classList.contains("is-flipped")).toBe(true);
    fireEvent.click(card);
    expect(card.classList.contains("is-flipped")).toBe(false);
  });

  it("невидимую сторону не читают вслух", () => {
    const c = setup(["one"]);
    const card = c.querySelector(".swipe-card")!;

    // Лицом вверх: изнанка скрыта.
    expect(faceOf(c, "лицо one").getAttribute("aria-hidden")).toBe("false");
    expect(faceOf(c, "изнанка one").getAttribute("aria-hidden")).toBe("true");

    fireEvent.click(card);

    // Перевернули — скрытой стала лицевая.
    expect(faceOf(c, "лицо one").getAttribute("aria-hidden")).toBe("true");
    expect(faceOf(c, "изнанка one").getAttribute("aria-hidden")).toBe("false");
  });

  it("переворачивается та карточка, которой коснулись", () => {
    const c = setup(["one", "two"]);
    const cards = c.querySelectorAll(".swipe-card");
    expect(cards.length).toBe(2);

    fireEvent.click(cards[1]);

    expect(cards[0].classList.contains("is-flipped")).toBe(false);
    expect(cards[1].classList.contains("is-flipped")).toBe(true);
  });

  it("кнопка на изнанке не отменяет сама себя", () => {
    // Нажатие внутри изнанки всплывает до карточки, а касание карточки её
    // переворачивает. «Назад» срабатывал — и карточка тут же переворачивалась
    // обратно. По коду обе половины верны, поймать можно только вместе.
    const { container } = render(
      <SwipeDeck<Card>
        items={[{ id: "one" }]}
        keyOf={(c) => c.id}
        onSwipe={() => Promise.resolve(true)}
        renderCard={(c) => <div>лицо {c.id}</div>}
        renderBack={(c, ctl) => (
          <div>
            изнанка {c.id}
            <div onClick={(e) => e.stopPropagation()}>
              <button onClick={ctl.close}>Назад</button>
            </div>
          </div>
        )}
      />,
    );
    const card = container.querySelector(".swipe-card")!;
    fireEvent.click(card);
    expect(card.classList.contains("is-flipped")).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Назад" }));

    expect(card.classList.contains("is-flipped")).toBe(false);
  });

  it("улетевшая карточка не оставляет следующую перевёрнутой", async () => {
    let fire: ((dir: "like" | "dislike") => void) | null = null;
    const { container } = render(
      <SwipeDeck<Card>
        items={[{ id: "one" }, { id: "two" }]}
        keyOf={(c) => c.id}
        onSwipe={() => Promise.resolve(true)}
        controllerRef={(fn) => (fire = fn)}
        renderCard={(c) => <div>лицо {c.id}</div>}
        renderBack={(c) => <div>изнанка {c.id}</div>}
      />,
    );
    const first = container.querySelector(".swipe-card")!;
    fireEvent.click(first);
    expect(first.classList.contains("is-flipped")).toBe(true);

    // Решение принято с изнанки — кнопкой под колодой. Карточка улетает, и
    // следующая обязана встретить человека лицом, а не изнанкой.
    fire!("like");

    // fire зовут напрямую, а не через событие React, поэтому перерисовку надо
    // дождаться: без этого проверка успевает раньше и ловит прошлый кадр.
    await waitFor(() => {
      const cards = container.querySelectorAll(".swipe-card");
      expect(cards.length).toBeGreaterThan(0);
      for (const card of cards) {
        expect(card.classList.contains("is-flipped")).toBe(false);
      }
    });
  });

});
