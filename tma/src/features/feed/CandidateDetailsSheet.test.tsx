// @vitest-environment jsdom
/**
 * Шторка «Подробнее о человеке» — то, чего у заведения раньше не было вовсе.
 *
 * Всё, что известно о кандидате, лежало на самой карточке: рассказ о себе,
 * умения, район, медкнижка. Пять строк текста на экране, где выбирают за три
 * секунды, — и при этом ни одной подробности сверх них. Теперь рассказ и
 * умения здесь, а позвать можно не закрывая шторку: заставлять человека
 * закрыть её и заново тянуться к сердцу — ровно тот момент, когда решение
 * остывает.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Seeker } from "@/types/domain";
import { CandidateDetailsSheet } from "./CandidateDetailsSheet";

const MARIA: Seeker = {
  id: "seeker-1",
  name: "Мария",
  age: 28,
  city: "Москва",
  district: "Хамовники",
  lat: 55.73,
  lng: 37.58,
  roles: ["barista", "waiter"],
  medBook: "yes",
  selfEmployed: true,
  experienceTags: ["experienced", "cashRegister"],
  rating: 4.8,
  photoUrls: [],
  about: "Работала в сетевой кофейне два года.",
  shiftsTotal: 12,
  shiftsAttended: 11,
  employersTotal: 6,
};

// Авто-очистки между тестами в конфиге нет — прибираем сами, иначе шторки от
// прошлых тестов остаются в документе и запрос находит две кнопки.
afterEach(cleanup);

describe("шторка «Подробнее о человеке»", () => {
  it("зовёт того человека, которого заведение читало", () => {
    const onCall = vi.fn();
    render(<CandidateDetailsSheet s={MARIA} onClose={vi.fn()} onCall={onCall} />);

    fireEvent.click(screen.getByRole("button", { name: /Позвать/ }));

    expect(onCall).toHaveBeenCalledTimes(1);
    expect(onCall).toHaveBeenCalledWith(MARIA);
  });

  it("«Закрыть» остаётся и приглашением не считается", () => {
    const onCall = vi.fn();
    const onClose = vi.fn();
    render(<CandidateDetailsSheet s={MARIA} onClose={onClose} onCall={onCall} />);

    fireEvent.click(screen.getByRole("button", { name: /Закрыть/ }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onCall).not.toHaveBeenCalled();
  });

  it("показывает то, что убрали с карточки", () => {
    render(<CandidateDetailsSheet s={MARIA} onClose={vi.fn()} />);

    // Рассказ о себе и умения — ради них шторка и заведена. Если они отсюда
    // пропадут, они пропадут из продукта совсем: на карточке их больше нет.
    expect(screen.getByText(/Работала в сетевой кофейне/)).toBeTruthy();
    expect(screen.getByText(/Работа с кассой/)).toBeTruthy();
    // И главное для заведения — выйдет человек или нет.
    expect(screen.getByText(/Можно ли положиться/)).toBeTruthy();
  });

  it("новичку не приписывает несуществующий опыт", () => {
    const rookie: Seeker = {
      ...MARIA,
      about: "",
      experienceTags: [],
      rating: 0,
      shiftsTotal: undefined,
      shiftsAttended: undefined,
      employersTotal: undefined,
    };
    render(<CandidateDetailsSheet s={rookie} onClose={vi.fn()} />);

    // Ноль смен — это «смен не было», а не «0%»: прочерк и ноль читаются как
    // плохая оценка, хотя человек просто ещё не начинал.
    expect(screen.getByText(/Смен на площадке пока не было/)).toBeTruthy();
    // Звезду без единого отзыва не рисуем вовсе — иначе «0» выглядит оценкой.
    expect(screen.queryByText("0")).toBeNull();
  });

  it("без обработчика кнопки «Позвать» нет", () => {
    render(<CandidateDetailsSheet s={MARIA} onClose={vi.fn()} />);

    expect(screen.queryByRole("button", { name: /Позвать/ })).toBeNull();
    expect(screen.getByRole("button", { name: /Закрыть/ })).toBeTruthy();
  });
});
