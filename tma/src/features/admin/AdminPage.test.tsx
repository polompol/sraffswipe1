// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { onlineManager, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { ApiError } from "@/api/client";

const { overview } = vi.hoisted(() => ({ overview: vi.fn() }));
vi.mock("@/api/endpoints", async (original) => ({
  ...await original<typeof import("@/api/endpoints")>(), fetchAdminOverview: overview,
}));
vi.mock("@/telegram/sdk", () => ({ showBackButton: () => () => {}, haptic: vi.fn() }));
import { AdminPage } from "./AdminPage";

afterEach(() => { cleanup(); onlineManager.setOnline(true); vi.resetAllMocks(); });
function show() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><MemoryRouter><AdminPage /></MemoryRouter></QueryClientProvider>);
}
it("network failure has a retry, not an access denial", async () => {
  overview.mockRejectedValue(new ApiError("offline", { method: "GET", url: "/admin/overview" }, { status: 503, data: null }));
  show();
  const retry = await screen.findByRole("button", { name: "Повторить" });
  expect(screen.queryByText("Доступ только для администратора")).toBeNull();
  fireEvent.click(retry);
  await waitFor(() => expect(overview).toHaveBeenCalledTimes(2));
});
it("a real access denial never offers admin actions", async () => {
  overview.mockRejectedValue(new ApiError("forbidden", { method: "GET", url: "/admin/overview" }, { status: 403, data: null }));
  show();
  await screen.findByText("Доступ только для администратора");
  expect(screen.queryByRole("button", { name: "Деньги" })).toBeNull();
});
it("an offline first visit does not mount admin actions before authorization", () => {
  onlineManager.setOnline(false);
  show();
  expect(screen.queryByRole("button", { name: "Деньги" })).toBeNull();
  expect(screen.getByText(/Нет соединения/)).toBeTruthy();
  expect(overview).not.toHaveBeenCalled();
});
