// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Vacancy } from "@/types/domain";
import { VacancyList } from "./VacancyList";

vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: [] }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));
vi.mock("@/telegram/sdk", () => ({ haptic: vi.fn() }));

const vacancy: Vacancy = {
  id: "v1",
  employerId: "e1",
  companyName: "Тестовое кафе",
  companyPhotoUrl: "",
  role: "waiter",
  date: "2099-01-01",
  startTime: 600,
  endTime: 1080,
  rate: 400,
  rateType: "hour",
  description: "",
  requireMedBook: false,
  requireExperience: false,
  lat: 55.75,
  lng: 37.61,
  address: "Тестовая улица, 1",
  city: "Москва",
  interiorPhotoUrl: "",
  employerVerified: true,
  status: "open",
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((ok, fail) => {
    resolve = ok;
    reject = fail;
  });
  return { promise, resolve, reject };
}

afterEach(cleanup);

describe("VacancyList pending actions", () => {
  it("locks the row while an action is pending and removes it after success", async () => {
    const pending = deferred<boolean>();
    const onAct = vi.fn(() => pending.promise);
    render(<VacancyList items={[vacancy]} onAct={onAct} />);

    const like = screen.getByRole("button", { name: "Откликнуться" });
    fireEvent.click(like);
    fireEvent.click(like);

    expect(onAct).toHaveBeenCalledTimes(1);
    expect(like).toBeDisabled();

    await act(async () => pending.resolve(true));
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Откликнуться" })).toBeNull(),
    );
  });

  it("treats a resolved false result as an accepted action without a success toast", async () => {
    const onAct = vi.fn().mockResolvedValue(false);
    render(<VacancyList items={[vacancy]} onAct={onAct} />);

    fireEvent.click(screen.getByRole("button", { name: "Откликнуться" }));

    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Откликнуться" })).toBeNull(),
    );
    expect(onAct).toHaveBeenCalledTimes(1);
  });
});
