// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { SwipePhoto } from "./SwipePhoto";
import { SwipeDeck } from "./SwipeDeck";

vi.mock("@/telegram/sdk", () => ({ haptic: vi.fn() }));
afterEach(cleanup);

it("листание фото не откликается и не переворачивает карточку", () => {
  const cardClick = vi.fn();
  render(<div onClick={cardClick}><SwipePhoto photos={["/one.jpg", "/two.jpg"]} label="Анна" initial="А" /></div>);
  fireEvent.click(screen.getByRole("button", { name: "Следующее фото" }));
  expect(screen.getByRole("img").getAttribute("src")).toBe("/two.jpg");
  expect(cardClick).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Следующее фото" }));
  expect(screen.getByRole("img").getAttribute("src")).toBe("/one.jpg");
});

it("ошибка фотографии не мешает перейти к следующей", () => {
  render(<SwipePhoto photos={["/broken.jpg", "/ok.jpg"]} label="Заведение" initial="З" />);
  fireEvent.error(screen.getByRole("img"));
  expect(screen.queryByRole("img")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Следующее фото" }));
  fireEvent.load(screen.getByRole("img"));
  expect(screen.getByRole("img").getAttribute("src")).toBe("/ok.jpg");
});

it("кнопка фото работает внутри настоящей колоды, не отправляя отклик", () => {
  const onSwipe = vi.fn();
  render(<SwipeDeck items={[{ id: "one" }]} keyOf={(item) => item.id} onSwipe={onSwipe}
    renderCard={() => <SwipePhoto photos={["/one.jpg", "/two.jpg"]} label="Кофейня" initial="К" />}
    renderBack={() => <div>Подробности</div>} />);
  const next = screen.getByRole("button", { name: "Следующее фото" });
  fireEvent.pointerDown(next, { pointerId: 1, clientX: 20, clientY: 20 });
  fireEvent.pointerUp(next, { pointerId: 1, clientX: 20, clientY: 20 });
  fireEvent.click(next);
  expect(screen.getByRole("img").getAttribute("src")).toBe("/two.jpg");
  expect(onSwipe).not.toHaveBeenCalled();
  expect(screen.getByText("Подробности").closest(".flip-back")?.getAttribute("aria-hidden")).toBe("true");
});
