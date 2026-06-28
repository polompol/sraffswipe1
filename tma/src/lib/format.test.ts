import { describe, it, expect } from "vitest";
import {
  fmtTime,
  rateLabel,
  estimatedPay,
  todayISO,
  shiftDayLabel,
  isUrgentShift,
} from "./format";
import type { Vacancy } from "@/types/domain";

describe("format", () => {
  it("fmtTime форматирует минуты от полуночи", () => {
    expect(fmtTime(0)).toBe("00:00");
    expect(fmtTime(8 * 60)).toBe("08:00");
    expect(fmtTime(23 * 60 + 30)).toBe("23:30");
  });

  it("rateLabel добавляет суффикс", () => {
    expect(rateLabel(350, "perHour")).toBe("350 ₽/час");
    expect(rateLabel(4500, "perShift")).toBe("4500 ₽/смена");
  });

  it("estimatedPay: за смену — как есть, за час — умножает на часы", () => {
    const base = {
      startTime: 8 * 60,
      endTime: 16 * 60,
      rate: 350,
    } as Vacancy;
    expect(estimatedPay({ ...base, rateType: "perShift", rate: 2800 })).toBe(2800);
    expect(estimatedPay({ ...base, rateType: "perHour" })).toBe(2800); // 8ч × 350
  });

  it("shiftDayLabel: сегодня/завтра/дата", () => {
    const today = todayISO();
    const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    expect(shiftDayLabel(today)).toBe("Сегодня");
    expect(shiftDayLabel(tomorrow)).toBe("Завтра");
    expect(shiftDayLabel("2020-03-15")).toBe("15 марта");
  });

  it("isUrgentShift: горит только если смена сегодня", () => {
    const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    expect(isUrgentShift(todayISO())).toBe(true);
    expect(isUrgentShift(tomorrow)).toBe(false);
  });
});
