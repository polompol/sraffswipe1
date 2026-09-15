// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
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
  reports: vi.fn(),
  jobs: vi.fn(),
  notify: vi.fn(),
  messages: vi.fn(),
  blockUser: vi.fn(),
  blockVacancy: vi.fn(),
  resolveMatch: vi.fn(),
  resolveReport: vi.fn(),
}));

vi.mock("@/api/endpoints", async (original) => ({
  ...await original<typeof import("@/api/endpoints")>(),
  fetchAdminReports: api.reports,
  fetchJobsHealth: api.jobs,
  fetchNotifyHealth: api.notify,
  fetchDisputeMessages: api.messages,
  blockUser: api.blockUser,
  blockVacancy: api.blockVacancy,
  resolveMatch: api.resolveMatch,
  resolveReport: api.resolveReport,
}));
vi.mock("@/telegram/sdk", () => ({
  showBackButton: () => () => {},
  haptic: vi.fn(),
}));

import { TodayTab } from "./TodayTab";

const overview = {
  users: 1,
  activeVacancies: 1,
  likes: 1,
  matches: 1,
  openReports: 1,
  completedShifts: 0,
};

function show() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <div id="root">
        <TodayTab ov={{ isLoading: false, data: overview }} />
      </div>
    </QueryClientProvider>,
  );
}

function commonMocks() {
  api.jobs.mockResolvedValue([]);
  api.notify.mockResolvedValue({
    sent: 0,
    failedRow: 0,
    blocked: 0,
    lastError: "",
    broken: false,
  });
  api.messages.mockResolvedValue([]);
  api.blockUser.mockResolvedValue(undefined);
  api.blockVacancy.mockResolvedValue(undefined);
  api.resolveMatch.mockResolvedValue(undefined);
  api.resolveReport.mockResolvedValue(undefined);
}

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

it("does not block a user until the operator confirms a non-blank reason", async () => {
  commonMocks();
  api.reports.mockResolvedValue([
    {
      id: "report-user",
      targetType: "user",
      targetId: "user-1",
      targetInfo: "Иван",
      reason: "abuse",
      text: "оскорбления",
      status: "open",
      createdAt: new Date().toISOString(),
      dispute: null,
    },
  ]);
  show();

  fireEvent.click(await screen.findByRole("button", { name: /Заблокировать/ }));
  expect(api.blockUser).not.toHaveBeenCalled();

  const dialog = screen.getByRole("dialog");
  expect(within(dialog).getByText("Заблокировать пользователя?")).toBeTruthy();
  const confirm = within(dialog).getByRole("button", { name: "Заблокировать" });
  expect(confirm.hasAttribute("disabled")).toBe(true);

  fireEvent.change(within(dialog).getByLabelText("Причина"), {
    target: { value: "  подтверждённое мошенничество  " },
  });
  expect(confirm.hasAttribute("disabled")).toBe(false);
  fireEvent.click(confirm);

  await waitFor(() =>
    expect(api.blockUser).toHaveBeenCalledWith(
      "user-1",
      "подтверждённое мошенничество",
    ),
  );
});

it("asks for a reason before a final dispute verdict", async () => {
  commonMocks();
  api.reports.mockResolvedValue([
    {
      id: "report-match",
      targetType: "match",
      targetId: "match-1",
      targetInfo: "переписка по мэтчу",
      reason: "other",
      text: "спор по выходу",
      status: "open",
      createdAt: new Date().toISOString(),
      dispute: null,
    },
  ]);
  show();

  fireEvent.click(await screen.findByRole("button", { name: /Засчитать смену/ }));
  expect(api.resolveMatch).not.toHaveBeenCalled();

  const dialog = screen.getByRole("dialog");
  expect(within(dialog).getByText("Засчитать смену?")).toBeTruthy();
  const confirm = within(dialog).getByRole("button", { name: "Засчитать" });
  expect(confirm.hasAttribute("disabled")).toBe(true);

  fireEvent.change(within(dialog).getByLabelText("Причина"), {
    target: { value: "  проверены сообщения и код прихода  " },
  });
  fireEvent.click(confirm);

  await waitFor(() =>
    expect(api.resolveMatch).toHaveBeenCalledWith(
      "match-1",
      "completed",
      "проверены сообщения и код прихода",
    ),
  );
  expect(api.resolveReport).toHaveBeenCalledWith("report-match");
});
