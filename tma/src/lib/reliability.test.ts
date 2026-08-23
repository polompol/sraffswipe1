import { describe, expect, it } from "vitest";
import { attendanceRate, reliabilityText } from "./reliability";

describe("надёжность одной строкой", () => {
  it("у новичка строки нет — врать про «0 из 0» незачем", () => {
    expect(reliabilityText(0, 0, 0)).toBe("");
    expect(reliabilityText(undefined, undefined, undefined)).toBe("");
  });

  it("показывает выходы и число разных заведений", () => {
    expect(reliabilityText(5, 5, 3)).toBe("100% выходов · 3 заведения");
    expect(reliabilityText(12, 11, 6)).toBe("91% выходов · 6 заведений");
    expect(reliabilityText(1, 1, 1)).toBe("100% выходов · 1 заведение");
  });

  it("накрутка одной парой аккаунтов видна: много смен, одно заведение", () => {
    expect(reliabilityText(12, 12, 1)).toContain("1 заведение");
  });

  it("без данных о заведениях показывает хотя бы выходы", () => {
    expect(reliabilityText(4, 3)).toBe("75% выходов");
  });

  it("одна мысль сказана один раз: процента и «N из M» вместе больше нет", () => {
    expect(reliabilityText(12, 11, 6)).not.toContain("из");
    expect(reliabilityText(12, 11, 6)).not.toContain("вышел");
  });
});

describe("процент выходов", () => {
  it("у новичка процента нет — врать про «0 из 0» не о чем", () => {
    expect(attendanceRate(0, 0)).toBe("");
    expect(attendanceRate(undefined, undefined)).toBe("");
  });

  it("считает и округляет вниз", () => {
    expect(attendanceRate(40, 38)).toBe("95%");
    expect(attendanceRate(40, 39)).toBe("97%");
    expect(attendanceRate(12, 12)).toBe("100%");
    expect(attendanceRate(3, 0)).toBe("0%");
  });
});
