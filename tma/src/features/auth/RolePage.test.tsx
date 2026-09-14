// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { LS } from "@/lib/storage";

const { auth, setAuth, mode } = vi.hoisted(() => ({
  auth: vi.fn(), setAuth: vi.fn(), mode: { backend: false, telegram: true },
}));
vi.mock("@/api/client", () => ({ get useBackend() { return mode.backend; } }));
vi.mock("@/api/endpoints", () => ({ authTelegram: auth, track: vi.fn() }));
vi.mock("@/store/session", () => ({
  useSession: (selector: (state: { setAuth: typeof setAuth }) => unknown) => selector({ setAuth }),
}));
vi.mock("@/telegram/sdk", () => ({
  rawInitData: () => "signed", haptic: vi.fn(), openExternal: vi.fn(), insideTelegram: () => mode.telegram,
}));
vi.mock("@/components/Toast", () => ({ toast: vi.fn() }));
import { RolePage } from "./RolePage";

beforeEach(() => {
  localStorage.clear(); vi.clearAllMocks(); mode.backend = false; mode.telegram = true;
});
afterEach(cleanup);

function page() { render(<MemoryRouter><RolePage /></MemoryRouter>); }
function roles() { return screen.getAllByRole("button").filter((b) => b.textContent?.includes("Я ищу")) as HTMLButtonElement[]; }

it("обе роли недоступны с клавиатуры до согласия", () => {
  page();
  expect(roles().every((b) => b.disabled)).toBe(true);
  fireEvent.click(roles()[0]);
  expect(auth).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("checkbox"));
  expect(roles().every((b) => !b.disabled)).toBe(true);
});

it("двойное нажатие и выбор другой роли не создают два входа", async () => {
  let finish!: (data: unknown) => void;
  auth.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
  localStorage.setItem(LS.consent, "1");
  page();
  fireEvent.click(roles()[0]);
  fireEvent.click(roles()[1]);
  fireEvent.click(roles()[0]);
  expect(roles().every((b) => b.disabled)).toBe(true);
  expect(auth).toHaveBeenCalledTimes(1);
  finish({ accessToken: "token", role: "seeker", userId: "u1" });
  await waitFor(() => expect(setAuth).toHaveBeenCalledWith("token", "seeker", "u1"));
});

it("после ошибки можно повторить выбор", async () => {
  auth.mockRejectedValue(new Error("Нет сети"));
  localStorage.setItem(LS.consent, "1");
  page();
  fireEvent.click(roles()[0]);
  await waitFor(() => expect(roles().every((b) => !b.disabled)).toBe(true));
  fireEvent.click(roles()[1]);
  await waitFor(() => expect(auth).toHaveBeenCalledTimes(2));
});

it("локальное демо открывает обе роли в обычном браузере", () => {
  mode.telegram = false;
  page();
  expect(roles()).toHaveLength(2);
  expect(screen.getByRole("status").textContent).toContain("Демо-режим");
});

it("с настоящим сервером браузер по-прежнему направляет в Telegram", () => {
  mode.telegram = false;
  mode.backend = true;
  page();
  expect(roles()).toHaveLength(0);
  expect(screen.getByRole("button", { name: "Открыть в Telegram" })).toBeTruthy();
});
