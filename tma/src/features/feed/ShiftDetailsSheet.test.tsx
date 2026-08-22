// @vitest-environment jsdom
/**
 * Из «Деталей смены» должно быть чем откликнуться.
 *
 * Раньше главного действия в шторке не было вовсе: единственной кнопкой внизу
 * стояло «Закрыть». Человек всё прочитал, решил — и должен был закрыть шторку
 * и заново тянуться к сердцу. Ровно в этот момент решение и остывает.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Vacancy } from "@/types/domain";
import { ShiftDetailsSheet } from "./ShiftDetailsSheet";

const VAC: Vacancy = {
  id: "vac-1",
  employerId: "emp-1",
  companyName: "Кофейня «Дрова»",
  companyPhotoUrl: "",
  role: "barista",
  date: "2030-05-17",
  startTime: 8 * 60,
  endTime: 16 * 60,
  rate: 350,
  rateType: "perHour",
  description: "Нужен бариста на утро.",
  requireMedBook: false,
  requireExperience: false,
  lat: 55.75,
  lng: 37.61,
  address: "ул. Льва Толстого, 16",
  city: "Москва",
  interiorPhotoUrl: "",
  employerVerified: false,
  status: "active",
};

// Авто-очистки между тестами в конфиге нет — прибираем сами, иначе
// шторки от прошлых тестов остаются в документе и запрос находит две кнопки.
afterEach(cleanup);

describe("шторка «Детали смены»", () => {
  it("откликается той сменой, которую человек читал", () => {
    const onLike = vi.fn();
    render(<ShiftDetailsSheet v={VAC} onClose={vi.fn()} onLike={onLike} />);

    fireEvent.click(screen.getByRole("button", { name: /Откликнуться/ }));

    expect(onLike).toHaveBeenCalledTimes(1);
    expect(onLike).toHaveBeenCalledWith(VAC);
  });

  it("«Закрыть» остаётся и не считается откликом", () => {
    const onLike = vi.fn();
    const onClose = vi.fn();
    render(<ShiftDetailsSheet v={VAC} onClose={onClose} onLike={onLike} />);

    fireEvent.click(screen.getByRole("button", { name: /Закрыть/ }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onLike).not.toHaveBeenCalled();
  });

  it("без обработчика отклика кнопки отклика нет", () => {
    render(<ShiftDetailsSheet v={VAC} onClose={vi.fn()} />);

    expect(screen.queryByRole("button", { name: /Откликнуться/ })).toBeNull();
    expect(screen.getByRole("button", { name: /Закрыть/ })).toBeTruthy();
  });
});
