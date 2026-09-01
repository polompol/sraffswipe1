// @vitest-environment jsdom
/**
 * Изнанка карточки — ЕДИНСТВЕННОЕ место, где живут подробности.
 *
 * С лицевой стороны убраны адрес, описание и чаевые у смены; рассказ о себе,
 * умения и «Самозанятый» у человека. Пропадёт что-то отсюда — пропадёт из
 * продукта совсем, и заметить это будет некому. Поэтому проверки здесь
 * сформулированы как «должно быть», а не как «выглядит нормально».
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { Seeker, Vacancy } from "@/types/domain";
import {
  CandidateDetailsBody,
  CandidateNote,
  ShiftDetailsBody,
  ShiftNote,
} from "./DetailsBody";

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
  payMethod: "card",
  tips: "shared",
};

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

afterEach(cleanup);

describe("подробности смены", () => {
  it("держит всё, что убрано с лицевой стороны", () => {
    render(<ShiftDetailsBody v={VAC} />);
    expect(screen.getByText(/ул\. Льва Толстого, 16/)).toBeTruthy();
    expect(screen.getByText(/Нужен бариста на утро/)).toBeTruthy();
    // Способ оплаты и чаевые — в разбивке «Сколько заплатят».
    expect(screen.getByText(/На карту/)).toBeTruthy();
    expect(screen.getByText(/Чаевые/)).toBeTruthy();
  });

  it("считает смену, а не пересказывает ставку", () => {
    render(<ShiftDetailsBody v={VAC} />);
    // 8 часов по 350 ₽ — человек не должен умножать в уме.
    expect(screen.getByText(/350 ₽\/час × 8 ч/)).toBeTruthy();
    expect(screen.getByText(/2 800 ₽/)).toBeTruthy();
  });

  it("предупреждает про деньги вперёд", () => {
    // Оговорка вынесена из тела намеренно: на изнанке она закреплена ВНЕ
    // прокрутки, иначе длинное описание уводило её под сгиб — а это
    // единственная защита работника от самого частого обмана.
    render(<ShiftNote />);
    expect(screen.getByText(/Просят деньги вперёд/)).toBeTruthy();
  });
});

describe("подробности человека", () => {
  it("держит всё, что убрано с лицевой стороны", () => {
    render(<CandidateDetailsBody s={MARIA} />);
    expect(screen.getByText(/Работала в сетевой кофейне/)).toBeTruthy();
    expect(screen.getByText(/Работа с кассой/)).toBeTruthy();
    expect(screen.getByText(/Самозанятый/)).toBeTruthy();
  });

  it("ставит надёжность выше всего остального", () => {
    render(<CandidateDetailsBody s={MARIA} />);
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
    render(<CandidateDetailsBody s={rookie} />);
    // Ноль смен — это «смен не было», а не «0%»: прочерк и ноль читаются как
    // плохая оценка, хотя человек просто ещё не начинал.
    expect(screen.getByText(/Смен на площадке пока не было/)).toBeTruthy();
    expect(screen.queryByText("0")).toBeNull();
  });

  it("честно говорит, что документы не проверены", () => {
    // Тоже закреплена вне прокрутки: заведение видит «Медкнижка: Есть» и
    // думает, что мы проверили. Не проверили.
    render(<CandidateNote />);
    expect(screen.getByText(/документы мы не храним/)).toBeTruthy();
  });
});
