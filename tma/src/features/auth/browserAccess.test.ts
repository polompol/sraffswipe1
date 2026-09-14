import { describe, expect, it } from "vitest";
import { allowRoleChoice } from "./browserAccess";

describe("allowRoleChoice", () => {
  it("allows browser role choice only in mock/demo builds", () => {
    expect(allowRoleChoice({ insideTelegram: false, useBackend: false })).toBe(true);
    expect(allowRoleChoice({ insideTelegram: false, useBackend: true })).toBe(false);
    expect(allowRoleChoice({ insideTelegram: true, useBackend: true })).toBe(true);
  });
});
