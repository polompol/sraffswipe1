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

const api = vi.hoisted(() => ({
  list: vi.fn(),
  reply: vi.fn(),
  close: vi.fn(),
}));

vi.mock("@/api/support", () => ({
  fetchAdminSupport: api.list,
  replySupportCase: api.reply,
  closeSupportCase: api.close,
}));
vi.mock("@/telegram/sdk", () => ({ haptic: vi.fn() }));

import { SupportQueue } from "./SupportQueue";

const item = {
  id: "case-1",
  number: "SS-1234ABCD",
  ownerId: "user-1",
  ownerRole: "seeker",
  ownerInfo: "Анна",
  topic: "payment",
  text: "Не вижу оплату за смену",
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
      <SupportQueue />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  api.list.mockReset();
  api.reply.mockReset();
  api.close.mockReset();
  api.list.mockResolvedValue([item]);
  api.reply.mockResolvedValue({ ...item, status: "answered" });
  api.close.mockResolvedValue({ ...item, status: "closed" });
});

afterEach(cleanup);

it("renders open cases with number, topic and owner", async () => {
  show();
  const card = await screen.findByRole("article", { name: /SS-1234ABCD/ });
  expect(within(card).getByText("Оплата")).toBeTruthy();
  expect(within(card).getByText(/Анна/)).toBeTruthy();
  expect(within(card).getByText("Не вижу оплату за смену")).toBeTruthy();
});

it("requires a reply and refreshes the queue after sending it", async () => {
  show();
  const card = await screen.findByRole("article", { name: /SS-1234ABCD/ });
  const send = within(card).getByRole("button", { name: "Ответить" });
  expect(send.hasAttribute("disabled")).toBe(true);

  fireEvent.change(within(card).getByLabelText("Ответ пользователю"), {
    target: { value: "  Проверили платёж, всё зачислено.  " },
  });
  fireEvent.click(send);

  await waitFor(() =>
    expect(api.reply).toHaveBeenCalledWith(
      "case-1",
      "Проверили платёж, всё зачислено.",
    ),
  );
  await waitFor(() => expect(api.list.mock.calls.length).toBeGreaterThanOrEqual(2));
});

it("closes a case exactly once", async () => {
  show();
  const card = await screen.findByRole("article", { name: /SS-1234ABCD/ });
  fireEvent.click(within(card).getByRole("button", { name: "Закрыть" }));

  await waitFor(() => expect(api.close).toHaveBeenCalledTimes(1));
  expect(api.close).toHaveBeenCalledWith("case-1", "");
});
