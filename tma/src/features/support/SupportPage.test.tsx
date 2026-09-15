// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

const api = vi.hoisted(() => ({
  create: vi.fn(),
  list: vi.fn(),
}));

vi.mock("@/api/endpoints", () => ({
  createSupportCase: api.create,
  fetchSupportCases: api.list,
}));
vi.mock("@/telegram/sdk", () => ({
  showBackButton: () => () => {},
  haptic: vi.fn(),
  openTelegram: vi.fn(),
}));

import { SupportPage } from "./SupportPage";

const created = {
  id: "case-created",
  number: "SS-A1B2C3D4",
  topic: "payment",
  text: "Не вижу ответ по оплате",
  status: "open",
  adminReply: null,
  createdAt: "2026-09-15T12:00:00Z",
  updatedAt: "2026-09-15T12:00:00Z",
};

function show() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <SupportPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  api.create.mockReset();
  api.list.mockReset();
  api.list.mockResolvedValue([]);
});

afterEach(cleanup);

it("requires a topic and a useful description before creating a case", async () => {
  show();

  await screen.findByText("Сообщить о проблеме");
  const submit = screen.getByRole("button", { name: "Отправить обращение" });
  expect(submit.hasAttribute("disabled")).toBe(true);

  fireEvent.change(screen.getByLabelText("Тема обращения"), {
    target: { value: "payment" },
  });
  fireEvent.change(screen.getByLabelText("Опишите проблему"), {
    target: { value: "мало" },
  });
  expect(submit.hasAttribute("disabled")).toBe(true);

  fireEvent.change(screen.getByLabelText("Опишите проблему"), {
    target: { value: "Не вижу ответ по оплате" },
  });
  expect(submit.hasAttribute("disabled")).toBe(false);
});

it("shows the returned case number and refreshes My cases after submit", async () => {
  let rows: typeof created[] = [];
  api.list.mockImplementation(async () => rows);
  api.create.mockImplementation(async () => {
    rows = [created];
    return created;
  });
  show();

  await screen.findByText("Сообщить о проблеме");
  fireEvent.change(screen.getByLabelText("Тема обращения"), {
    target: { value: "payment" },
  });
  fireEvent.change(screen.getByLabelText("Опишите проблему"), {
    target: { value: "  Не вижу ответ по оплате  " },
  });
  fireEvent.click(screen.getByRole("button", { name: "Отправить обращение" }));

  await waitFor(() =>
    expect(api.create).toHaveBeenCalledWith(
      "payment",
      "Не вижу ответ по оплате",
    ),
  );
  expect(await screen.findByText(/SS-A1B2C3D4/)).toBeTruthy();

  const myCases = screen.getByRole("region", { name: "Мои обращения" });
  expect(within(myCases).getByText("Не вижу ответ по оплате")).toBeTruthy();
  expect(api.list.mock.calls.length).toBeGreaterThanOrEqual(2);
});

it("renders the operator reply in My cases", async () => {
  api.list.mockResolvedValue([
    {
      ...created,
      id: "case-answered",
      number: "SS-FFEEDDCC",
      status: "answered",
      adminReply: "Платёж найден, баланс обновлён.",
    },
  ]);
  show();

  const myCases = await screen.findByRole("region", { name: "Мои обращения" });
  expect(within(myCases).getByText("SS-FFEEDDCC")).toBeTruthy();
  expect(within(myCases).getByText("Платёж найден, баланс обновлён.")).toBeTruthy();
});
