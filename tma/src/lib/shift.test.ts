import { describe, expect, it } from "vitest";
import { shiftEnded, shiftStarted, shiftWhen } from "./format";

/** Смена сегодня с заданными часами относительно текущего времени. */
function todayShift(startOffsetH: number, endOffsetH: number) {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const mins = now.getHours() * 60 + now.getMinutes();
  return {
    shiftDate: date,
    shiftStart: mins + startOffsetH * 60,
    shiftEnd: mins + endOffsetH * 60,
  };
}

describe("время смены", () => {
  it("будущая смена не считается начавшейся", () => {
    const m = todayShift(2, 6);
    expect(shiftStarted(m)).toBe(false);
    expect(shiftEnded(m)).toBe(false);
  });

  it("идущая смена началась, но не закончилась", () => {
    const m = todayShift(-2, 4);
    expect(shiftStarted(m)).toBe(true);
    expect(shiftEnded(m)).toBe(false);
  });

  it("прошедшая смена закончилась", () => {
    const m = todayShift(-8, -2);
    expect(shiftStarted(m)).toBe(true);
    expect(shiftEnded(m)).toBe(true);
  });

  it("ночная смена заканчивается на следующий день", () => {
    // 20:00 → 04:00: в момент 21:00 того же дня она ещё идёт.
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    const m = { shiftDate: date, shiftStart: 20 * 60, shiftEnd: 4 * 60 };
    // Конец считается на следующие сутки, значит «закончилась» не может быть
    // true, пока не наступил следующий день после 04:00.
    const endsTomorrow = new Date(now);
    endsTomorrow.setDate(endsTomorrow.getDate() + 1);
    endsTomorrow.setHours(4, 0, 0, 0);
    expect(shiftEnded(m)).toBe(Date.now() >= endsTomorrow.getTime());
  });

  it("без даты кнопки не прячем: лучше лишняя, чем пропавшая нужная", () => {
    expect(shiftStarted({})).toBe(false);
    expect(shiftEnded({})).toBe(false);
    expect(shiftWhen({})).toBe("");
  });
});
