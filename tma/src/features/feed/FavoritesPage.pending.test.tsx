// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Vacancy } from "@/types/domain";
import { FavoritesPage } from "./FavoritesPage";

const { sendSwipeMock, toastMock, navMock } = vi.hoisted(() => ({
  sendSwipeMock: vi.fn(),
  toastMock: vi.fn(),
  navMock: vi.fn(),
}));

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
  rateType: "perHour",
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

vi.mock("react-router-dom", () => ({
  useNavigate: () => navMock,
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: ({ queryKey }: { queryKey: unknown[] }) =>
    queryKey[0] === "favorites"
      ? { data: [vacancy], isLoading: false, isError: false, refetch: vi.fn() }
      : { data: [], isLoading: false, isError: false, refetch: vi.fn() },
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

vi.mock("@/api/endpoints", () => ({
  listFavorites: vi.fn(),
  listFavoriteIds: vi.fn(),
  sendSwipe: sendSwipeMock,
  addFavorite: vi.fn(),
  removeFavorite: vi.fn(),
}));

vi.mock("@/telegram/sdk", () => ({
  showBackButton: vi.fn(),
  haptic: vi.fn(),
}));

vi.mock("@/components/Toast", () => ({ toast: toastMock }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("FavoritesPage swipe failure", () => {
  it("keeps a favorite visible when the server rejects the response", async () => {
    sendSwipeMock.mockRejectedValueOnce(new Error("network down"));
    render(<FavoritesPage />);

    fireEvent.click(screen.getByRole("button", { name: "Откликнуться" }));

    await waitFor(() => expect(sendSwipeMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(toastMock).toHaveBeenCalled());
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Откликнуться" })).not.toBeNull(),
    );
    expect(screen.getByText("Тестовое кафе")).not.toBeNull();
  });
});
