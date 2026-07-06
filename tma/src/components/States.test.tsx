// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ErrorBox, Loading } from "./States";

describe("States components", () => {
  it("Loading рендерит подпись", () => {
    render(<Loading label="Грузим" />);
    expect(screen.getByText("Грузим")).toBeTruthy();
  });

  it("ErrorBox вызывает onRetry по клику", () => {
    const onRetry = vi.fn();
    render(<ErrorBox onRetry={onRetry} />);
    fireEvent.click(screen.getByText("Повторить"));
    expect(onRetry).toHaveBeenCalledOnce();
  });
});
