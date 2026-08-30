import { describe, expect, it } from "vitest";
import { countActiveFilters, isTodayOnly, toggleTodayFilter } from "./useFeedFilters";
import { todayISO } from "@/lib/format";

describe("условия ленты", () => {
  it("считает включённые условия по роли", () => {
    // «Район» и «надёжность» есть только у заведения, «оплата» — только у
    // работника: один и тот же набор у разных ролей значит разное.
    const f = { city: "Москва", role: "barista", min_rate: 400, district: "Центр" };
    expect(countActiveFilters(f, true)).toBe(3);
    expect(countActiveFilters(f, false)).toBe(2);
  });

  it("пустой набор — ноль условий", () => {
    expect(countActiveFilters({}, true)).toBe(0);
    expect(countActiveFilters({}, false)).toBe(0);
  });

  it("нулевая ставка не считается включённым условием", () => {
    // min_rate: 0 — это «любая ставка», а не выбор человека.
    expect(countActiveFilters({ min_rate: 0 }, true)).toBe(0);
  });

  it("«Сегодня» включается и снимается, не трогая остальное", () => {
    const base = { city: "Москва", role: "barista" };
    expect(isTodayOnly(base)).toBe(false);

    const on = toggleTodayFilter(base);
    expect(isTodayOnly(on)).toBe(true);
    expect(on.date_from).toBe(todayISO());
    expect(on.date_to).toBe(todayISO());
    expect(on.city, "город при этом не теряется").toBe("Москва");

    const off = toggleTodayFilter(on);
    expect(isTodayOnly(off)).toBe(false);
    expect(off).toEqual(base);
  });

  it("диапазон дат из шторки не считается за «Сегодня»", () => {
    // В шторке можно выбрать «завтра» или «на неделе»: чип «Сегодня» тогда
    // гореть не должен, иначе человек не поймёт, почему лента не та.
    const week = { date_from: todayISO(), date_to: "2099-01-01" };
    expect(isTodayOnly(week)).toBe(false);
  });
});
