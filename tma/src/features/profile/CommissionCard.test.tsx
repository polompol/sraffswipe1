// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const { commission, topup, openExternal } = vi.hoisted(() => ({
  commission: vi.fn(), topup: vi.fn(), openExternal: vi.fn(),
}));
vi.mock("@/api/endpoints", async (original) => ({
  ...await original<typeof import("@/api/endpoints")>(),
  fetchMyCommission: commission, walletTopup: topup,
}));
vi.mock("@/telegram/sdk", () => ({
  showBackButton: () => () => {}, haptic: vi.fn(), openExternal,
}));
vi.mock("@/components/Toast", () => ({ toast: vi.fn() }));
import { CommissionCard } from "./ProfilePage";

beforeEach(() => {
  commission.mockResolvedValue({
    pct: 10, pendingRub: 0, pendingShifts: 0, balanceRub: 0,
    overdue: false, topupAvailable: true, docsAvailable: false,
  });
  topup.mockResolvedValue({ url: "https://pay.example/checkout" });
});
afterEach(() => { cleanup(); vi.resetAllMocks(); });
function show() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><CommissionCard /></QueryClientProvider>);
}

it("amount selection needs confirmation; cancel creates no payment", async () => {
  show();
  fireEvent.click(await screen.findByRole("button", { name: /1\s*000\s*₽/ }));
  const dialog = await screen.findByRole("dialog", { name: "Пополнить баланс" });
  expect(within(dialog).getByText(/не оплата работы сотрудника/)).toBeTruthy();
  expect(topup).not.toHaveBeenCalled();
  fireEvent.click(within(dialog).getByRole("button", { name: "Отмена" }));
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(topup).not.toHaveBeenCalled();
});

it("one confirmed amount opens the provider, not a fake paid state", async () => {
  show();
  fireEvent.click(await screen.findByRole("button", { name: /3\s*000\s*₽/ }));
  fireEvent.click(await screen.findByRole("button", { name: "Перейти к оплате" }));
  await waitFor(() => expect(topup).toHaveBeenCalledWith(3000));
  expect(topup).toHaveBeenCalledTimes(1);
  await waitFor(() => expect(openExternal).toHaveBeenCalledWith("https://pay.example/checkout"));
  expect(screen.queryByText("Оплачено")).toBeNull();
  expect(screen.getByText(/Открытие страницы банка не подтверждает оплату/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Проверить баланс" }));
  await waitFor(() => expect(commission).toHaveBeenCalledTimes(2));
  fireEvent.click(screen.getByRole("button", { name: "Открыть оплату" }));
  expect(topup).toHaveBeenCalledTimes(1);
  expect(openExternal).toHaveBeenCalledTimes(2);
});

it("provider creation failure preserves the confirmation and selected amount", async () => {
  topup.mockRejectedValue(new Error("offline"));
  show();
  fireEvent.click(await screen.findByRole("button", { name: /5\s*000\s*₽/ }));
  fireEvent.click(await screen.findByRole("button", { name: "Перейти к оплате" }));
  await waitFor(() => expect(topup).toHaveBeenCalledWith(5000));
  expect(await screen.findByRole("dialog", { name: "Пополнить баланс" })).toBeTruthy();
  expect(openExternal).not.toHaveBeenCalled();
});
