import { describe, expect, it } from "vitest";
import { createBackStack, type BackButtonPort } from "./backStack";

/** Кнопка «Назад» понарошку: запоминает, что ей велели. */
function fakeButton() {
  const state = { shown: false, handlers: 0 };
  let current: (() => void) | null = null;
  const port: BackButtonPort = {
    show: () => { state.shown = true; },
    hide: () => { state.shown = false; },
    onClick(h) {
      current = h;
      state.handlers += 1;
      return () => { current = null; state.handlers -= 1; };
    },
  };
  return { port, state, press: () => current?.() };
}

describe("кнопка «Назад»", () => {
  it("нажатие достаётся верхнему окну, а не экрану под ним", () => {
    const b = fakeButton();
    const push = createBackStack(b.port);
    const seen: string[] = [];
    const offScreen = push(() => seen.push("экран"));
    const offSheet = push(() => seen.push("шторка"));

    b.press();
    expect(seen, "пока шторка открыта, «назад» закрывает её").toEqual(["шторка"]);

    offSheet();
    b.press();
    expect(seen, "шторка закрыта — «назад» снова у экрана").toEqual(["шторка", "экран"]);
    offScreen();
  });

  it("кнопка прячется только когда закрыто всё", () => {
    const b = fakeButton();
    const push = createBackStack(b.port);
    const offScreen = push(() => {});
    const offSheet = push(() => {});
    expect(b.state.shown).toBe(true);

    offSheet();
    expect(b.state.shown, "экран ещё открыт — кнопка нужна").toBe(true);

    offScreen();
    expect(b.state.shown).toBe(false);
  });

  it("повторная уборка не сносит чужой обработчик", () => {
    // React в строгом режиме вызывает уборку эффекта дважды.
    const b = fakeButton();
    const push = createBackStack(b.port);
    const seen: string[] = [];
    const offScreen = push(() => seen.push("экран"));
    const offSheet = push(() => seen.push("шторка"));

    offSheet();
    offSheet();

    b.press();
    expect(seen).toEqual(["экран"]);
    offScreen();
  });

  it("подписка на нажатие всегда одна — обработчики не копятся", () => {
    const b = fakeButton();
    const push = createBackStack(b.port);
    const offs = [push(() => {}), push(() => {}), push(() => {})];
    expect(b.state.handlers).toBe(1);
    offs.forEach((off) => off());
    expect(b.state.handlers).toBe(0);
  });
});
