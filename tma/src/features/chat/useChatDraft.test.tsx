// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearChatAccount, loadDraft, saveDraft } from "./chatPersistence";

describe("chat draft", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    clearChatAccount("u1", "seeker");
    vi.useFakeTimers();
  });

  it("loads the current account and match draft on mount", async () => {
    saveDraft("u1", "seeker", "m1", "Продолжить позже");
    const { useChatDraft } = await import("./useChatDraft");
    const { result } = renderHook(() =>
      useChatDraft({ userId: "u1", role: "seeker", matchId: "m1" }),
    );
    expect(result.current.text).toBe("Продолжить позже");
  });

  it("persists typing after a short debounce", async () => {
    const { useChatDraft } = await import("./useChatDraft");
    const { result } = renderHook(() =>
      useChatDraft({ userId: "u1", role: "seeker", matchId: "m1" }),
    );

    act(() => result.current.setText("Новый текст"));
    expect(loadDraft("u1", "seeker", "m1")).toBe("");
    act(() => vi.advanceTimersByTime(250));
    expect(loadDraft("u1", "seeker", "m1")).toBe("Новый текст");
  });

  it("keeps independent drafts when switching chats", async () => {
    const { useChatDraft } = await import("./useChatDraft");
    const props = { matchId: "m1" };
    const { result, rerender } = renderHook(() =>
      useChatDraft({ userId: "u1", role: "seeker", matchId: props.matchId }),
    );

    act(() => result.current.setText("Для первой смены"));
    props.matchId = "m2";
    rerender();
    act(() => vi.runOnlyPendingTimers());
    expect(loadDraft("u1", "seeker", "m1")).toBe("Для первой смены");
    expect(result.current.text).toBe("");

    act(() => result.current.setText("Для второй смены"));
    act(() => vi.advanceTimersByTime(250));
    expect(loadDraft("u1", "seeker", "m2")).toBe("Для второй смены");
  });

  it("clears only the exact submitted snapshot", async () => {
    const { useChatDraft } = await import("./useChatDraft");
    const { result } = renderHook(() =>
      useChatDraft({ userId: "u1", role: "seeker", matchId: "m1" }),
    );

    act(() => result.current.setText("Отправляю"));
    const submitted = result.current.snapshotForSend();
    act(() => result.current.clearIfUnchanged(submitted));

    expect(result.current.text).toBe("");
    expect(loadDraft("u1", "seeker", "m1")).toBe("");
  });

  it("does not erase newer text when an older send finishes", async () => {
    const { useChatDraft } = await import("./useChatDraft");
    const { result } = renderHook(() =>
      useChatDraft({ userId: "u1", role: "seeker", matchId: "m1" }),
    );

    act(() => result.current.setText("Первое сообщение"));
    const submitted = result.current.snapshotForSend();
    act(() => result.current.setText("Уже пишу второе"));
    act(() => result.current.clearIfUnchanged(submitted));
    act(() => vi.advanceTimersByTime(250));

    expect(result.current.text).toBe("Уже пишу второе");
    expect(loadDraft("u1", "seeker", "m1")).toBe("Уже пишу второе");
  });

  it("flushes the latest draft on unmount before debounce fires", async () => {
    const { useChatDraft } = await import("./useChatDraft");
    const { result, unmount } = renderHook(() =>
      useChatDraft({ userId: "u1", role: "seeker", matchId: "m1" }),
    );

    act(() => result.current.setText("Закрыл приложение сразу"));
    unmount();

    expect(loadDraft("u1", "seeker", "m1")).toBe("Закрыл приложение сразу");
  });
});