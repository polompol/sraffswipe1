// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ReviewStars } from "./ReviewStars";
import { leaveReview } from "@/api/endpoints";

vi.mock("@/api/endpoints", () => ({ leaveReview: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/telegram/sdk", () => ({ haptic: vi.fn() }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

it("выбор звёзд — черновик, отзыв с комментарием отправляется отдельно", async () => {
  render(<ReviewStars matchId="shift-1" />);
  fireEvent.click(screen.getByRole("button", { name: "Оценка 4 из 5" }));
  expect(leaveReview).not.toHaveBeenCalled();
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "Условия совпали" } });
  fireEvent.click(screen.getByRole("button", { name: "Отправить отзыв" }));
  await waitFor(() => expect(leaveReview).toHaveBeenCalledWith("shift-1", 4, "Условия совпали"));
  await screen.findByText(/Спасибо за отзыв/);
});
