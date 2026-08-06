// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

type Payload = Record<string, unknown>;
const updateMe = vi.fn(async (_payload: Payload) => ({}));
let meFixture: Record<string, unknown> = {};
let currentRole: "seeker" | "employer" = "seeker";

vi.mock("@/api/endpoints", () => ({
  fetchMe: async () => meFixture,
  updateMe: (payload: Payload) => updateMe(payload),
}));
vi.mock("@/telegram/sdk", () => ({
  showBackButton: () => () => {},
  haptic: () => {},
}));
vi.mock("@/store/session", () => ({
  useSession: (sel: (s: { role: string }) => unknown) => sel({ role: currentRole }),
}));
vi.mock("@/components/PhotoUpload", () => ({
  PhotoUpload: () => <div data-testid="photo-upload" />,
}));

import { EditProfilePage } from "./EditProfilePage";

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <EditProfilePage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("Редактирование профиля: форма зависит от роли", () => {
  beforeEach(() => updateMe.mockClear());
  afterEach(cleanup);

  it("заведение правит НАЗВАНИЕ и не видит анкету соискателя", async () => {
    // Регрессия: формa не различала роли — владелец кафе видел «дату
    // рождения» и «должности», а поля названия заведения не было вовсе,
    // хотя сервер его принимает. Переименоваться было невозможно.
    currentRole = "employer";
    meFixture = { name: "Заведение", inn: "" };
    renderPage();

    await screen.findByText("Название заведения");
    expect(screen.queryByText("Дата рождения (только 18+)")).toBeNull();
    expect(screen.queryByText("Должности")).toBeNull();
    expect(screen.queryByTestId("photo-upload")).toBeNull();
  });

  it("заведение отправляет company_name, а не name", async () => {
    currentRole = "employer";
    meFixture = { name: "Заведение", inn: "7712345678" };
    renderPage();

    // Дожидаемся предзаполнения формы, иначе печатаем до прихода данных.
    const inn = (await screen.findByLabelText("ИНН (необязательно)")) as HTMLInputElement;
    await waitFor(() => expect(inn.value).toBe("7712345678"));

    const field = screen.getByLabelText("Название заведения") as HTMLInputElement;
    fireEvent.change(field, { target: { value: "Кофейня «Дрова»" } });
    fireEvent.click(screen.getByText("Сохранить"));

    await waitFor(() => expect(updateMe).toHaveBeenCalledTimes(1));
    const payload = updateMe.mock.calls[0]![0];
    expect(payload.company_name).toBe("Кофейня «Дрова»");
    expect(payload).not.toHaveProperty("birth_date");
    expect(payload).not.toHaveProperty("roles");
  });

  it("имя-заглушка показывается пустым полем, чтобы человек вписал своё", async () => {
    currentRole = "employer";
    meFixture = { name: "Заведение", inn: "" };
    renderPage();

    const field = (await screen.findByLabelText("Название заведения")) as HTMLInputElement;
    await waitFor(() => expect(field.value).toBe(""));
  });

  it("соискатель видит свою анкету и отправляет её поля", async () => {
    currentRole = "seeker";
    meFixture = { name: "Алексей", roles: [], experienceTags: [] };
    renderPage();

    await screen.findByText("Дата рождения (только 18+)");
    expect(screen.getByText("Должности")).toBeTruthy();
    expect(screen.queryByText("Название заведения")).toBeNull();

    fireEvent.click(screen.getByText("Сохранить"));
    await waitFor(() => expect(updateMe).toHaveBeenCalledTimes(1));
    const payload = updateMe.mock.calls[0]![0];
    expect(payload).toHaveProperty("birth_date");
    expect(payload).toHaveProperty("roles");
    expect(payload).not.toHaveProperty("company_name");
  });
});
