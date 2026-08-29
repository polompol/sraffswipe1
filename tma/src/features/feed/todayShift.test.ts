import { describe, expect, it } from "vitest";
import { pickTodayShifts } from "./todayShift";
import type { MatchModel } from "@/types/domain";

const base: MatchModel = {
  id: "1", employerId: "e", vacancyId: "v",
  status: "confirmed", confirmedBySeeker: true, confirmedByEmployer: true,
  shiftDate: "2026-08-18", shiftStart: 600,
};

describe("напоминание о сегодняшней смене", () => {
  it("показывает смену, назначенную на сегодня", () => {
    const { next } = pickTodayShifts([base], "2026-08-18");
    expect(next?.id).toBe("1");
  });

  it("молчит про завтрашнюю и вчерашнюю смену", () => {
    expect(pickTodayShifts([base], "2026-08-17").next).toBeUndefined();
    expect(pickTodayShifts([base], "2026-08-19").next).toBeUndefined();
  });

  it("не напоминает про закрытую смену", () => {
    const done = { ...base, checkedIn: true };
    expect(pickTodayShifts([done], "2026-08-18").next).toBeUndefined();
  });

  it("не напоминает, пока смена не подтверждена", () => {
    const draft: MatchModel = { ...base, status: "matched" };
    expect(pickTodayShifts([draft], "2026-08-18").next).toBeUndefined();
  });

  it("из нескольких смен берёт самую раннюю", () => {
    const late = { ...base, id: "2", shiftStart: 1200 };
    const early = { ...base, id: "3", shiftStart: 480 };
    const { shifts, next } = pickTodayShifts([late, base, early], "2026-08-18");
    expect(shifts).toHaveLength(3);
    expect(next?.id).toBe("3");
  });
});
