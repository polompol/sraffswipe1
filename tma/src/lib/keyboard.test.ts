// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";

import { watchKeyboard } from "./keyboard";

type ViewportEvent = "resize" | "scroll";

function installViewport(initialHeight: number, initialOffsetTop = 0) {
  const originalViewport = Object.getOwnPropertyDescriptor(window, "visualViewport");
  const originalInnerHeight = Object.getOwnPropertyDescriptor(window, "innerHeight");
  const listeners: Record<ViewportEvent, Set<() => void>> = {
    resize: new Set(),
    scroll: new Set(),
  };
  const state = {
    height: initialHeight,
    offsetTop: initialOffsetTop,
  };

  const viewport = {
    get height() {
      return state.height;
    },
    get offsetTop() {
      return state.offsetTop;
    },
    addEventListener(type: string, listener: EventListenerOrEventListenerObject) {
      if (type === "resize" || type === "scroll") {
        listeners[type].add(listener as () => void);
      }
    },
    removeEventListener(type: string, listener: EventListenerOrEventListenerObject) {
      if (type === "resize" || type === "scroll") {
        listeners[type].delete(listener as () => void);
      }
    },
  } as unknown as VisualViewport;

  Object.defineProperty(window, "innerHeight", {
    configurable: true,
    value: 844,
  });
  Object.defineProperty(window, "visualViewport", {
    configurable: true,
    value: viewport,
  });

  return {
    state,
    listeners,
    emit(type: ViewportEvent) {
      listeners[type].forEach((listener) => listener());
    },
    restore() {
      if (originalViewport) {
        Object.defineProperty(window, "visualViewport", originalViewport);
      } else {
        delete (window as { visualViewport?: VisualViewport }).visualViewport;
      }
      if (originalInnerHeight) {
        Object.defineProperty(window, "innerHeight", originalInnerHeight);
      }
    },
  };
}

afterEach(() => {
  document.documentElement.style.removeProperty("--kb");
});

describe("watchKeyboard", () => {
  it("tracks hidden viewport height on resize and scroll, then cleans up", () => {
    const fake = installViewport(500);
    try {
      const stop = watchKeyboard();
      expect(document.documentElement.style.getPropertyValue("--kb")).toBe("344px");

      fake.state.height = 840;
      fake.emit("resize");
      expect(document.documentElement.style.getPropertyValue("--kb")).toBe("0px");

      fake.state.height = 600;
      fake.state.offsetTop = 20;
      fake.emit("scroll");
      expect(document.documentElement.style.getPropertyValue("--kb")).toBe("224px");

      stop();
      expect(document.documentElement.style.getPropertyValue("--kb")).toBe("");
      expect(fake.listeners.resize.size).toBe(0);
      expect(fake.listeners.scroll.size).toBe(0);
    } finally {
      fake.restore();
    }
  });

  it("is a no-op when visualViewport is unavailable", () => {
    const originalViewport = Object.getOwnPropertyDescriptor(window, "visualViewport");
    Object.defineProperty(window, "visualViewport", {
      configurable: true,
      value: null,
    });

    try {
      const stop = watchKeyboard();
      expect(document.documentElement.style.getPropertyValue("--kb")).toBe("");
      expect(() => stop()).not.toThrow();
    } finally {
      if (originalViewport) {
        Object.defineProperty(window, "visualViewport", originalViewport);
      } else {
        delete (window as { visualViewport?: VisualViewport }).visualViewport;
      }
    }
  });
});