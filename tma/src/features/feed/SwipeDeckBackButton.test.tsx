// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const telegram = vi.hoisted(() => {
  const state: { handler: (() => void) | null } = { handler: null };
  const off = vi.fn(() => {
    state.handler = null;
  });
  const showBackButton = vi.fn((handler: () => void) => {
    state.handler = handler;
    return off;
  });
  return {
    state,
    off,
    showBackButton,
    haptic: vi.fn(),
  };
});

vi.mock("@/telegram/sdk", () => ({
  haptic: telegram.haptic,
  showBackButton: telegram.showBackButton,
}));

import { SwipeDeck } from "./SwipeDeck";

type Card = { id: string };

function renderDeck() {
  return render(
    <SwipeDeck<Card>
      items={[{ id: "one" }]}
      keyOf={(card) => card.id}
      onSwipe={() => Promise.resolve(true)}
      renderCard={(card) => <div>лицо {card.id}</div>}
      renderBack={(card) => <div>изнанка {card.id}</div>}
    />,
  );
}

afterEach(() => {
  cleanup();
  telegram.state.handler = null;
  telegram.showBackButton.mockClear();
  telegram.off.mockClear();
  telegram.haptic.mockClear();
});

describe("Telegram BackButton на изнанке свайп-карточки", () => {
  it("возвращает карточку лицом и снимает свой обработчик", async () => {
    const { container } = renderDeck();
    const card = container.querySelector(".swipe-card")!;

    fireEvent.click(card);
    expect(card.classList.contains("is-flipped")).toBe(true);

    await waitFor(() => {
      expect(telegram.showBackButton).toHaveBeenCalledTimes(1);
      expect(telegram.state.handler).not.toBeNull();
    });

    act(() => {
      telegram.state.handler?.();
    });

    await waitFor(() => {
      expect(card.classList.contains("is-flipped")).toBe(false);
      expect(telegram.off).toHaveBeenCalledTimes(1);
    });
  });
});
