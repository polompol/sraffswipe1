import { describe, it, expect } from "vitest";
import {
  sendSwipe,
  fetchFeed,
  updateMe,
  verifyEmployer,
} from "./mock";

describe("mock swipe logic", () => {
  it("дизлайк не создаёт мэтч", async () => {
    const res = await sendSwipe("vac1", "dislike");
    expect(res.matched).toBe(false);
  });

  it("лайк по существующей вакансии создаёт мэтч с matchId", async () => {
    const feed = await fetchFeed("seeker");
    const id = feed[0].id;
    const res = await sendSwipe(id, "like");
    expect(res.matched).toBe(true);
    expect(typeof res.matchId).toBe("string");
  });
});

describe("mock 18+ enforcement", () => {
  it("updateMe отклоняет несовершеннолетнего", async () => {
    await expect(updateMe({ birth_date: "2015-01-01" })).rejects.toThrow();
  });

  it("updateMe принимает 18+", async () => {
    const me = await updateMe({ name: "Тест", birth_date: "1990-01-01" });
    expect(me.name).toBe("Тест");
  });
});

describe("mock employer verify", () => {
  it("невалидный ИНН → found=false", async () => {
    const r = await verifyEmployer("123");
    expect(r.found).toBe(false);
  });
  it("валидный ИНН → found=true", async () => {
    const r = await verifyEmployer("7707083893");
    expect(r.found).toBe(true);
  });
});
