import { describe, expect, it } from "vitest";
import { reliabilityText } from "./reliability";

describe("надёжность одной строкой", () => {
  it("у новичка строки нет — врать про «0 из 0» незачем", () => {
    expect(reliabilityText(0, 0, 0)).toBe("");
    expect(reliabilityText(undefined, undefined, undefined)).toBe("");
  });

  it("показывает выходы и число разных заведений", () => {
    expect(reliabilityText(5, 5, 3)).toBe("вышел на 5 из 5 смен · 3 заведения");
    expect(reliabilityText(12, 11, 6)).toBe("вышел на 11 из 12 смен · 6 заведений");
    expect(reliabilityText(1, 1, 1)).toBe("вышел на 1 из 1 смен · 1 заведение");
  });

  it("накрутка одной парой аккаунтов видна: много смен, одно заведение", () => {
    expect(reliabilityText(12, 12, 1)).toContain("1 заведение");
  });

  it("без данных о заведениях показывает хотя бы выходы", () => {
    expect(reliabilityText(4, 3)).toBe("вышел на 3 из 4 смен");
  });
});
