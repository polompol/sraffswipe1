// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Message } from "@/types/domain";
import type { OutboxEntry } from "./chatPersistence";
import { ChatConnectionState } from "./ChatConnectionState";
import { MessageComposer } from "./MessageComposer";
import { MessageList } from "./MessageList";

const confirmed: Message = {
  id: "srv-1",
  clientMessageId: "c1",
  senderId: "u1",
  text: "Привет",
  isSystem: false,
  createdAt: "2026-09-14T10:00:01Z",
};

function outbox(overrides: Partial<OutboxEntry> = {}): OutboxEntry {
  return {
    clientMessageId: "c1",
    matchId: "m1",
    text: "Привет",
    createdAt: "2026-09-14T10:00:00Z",
    status: "pending",
    attempts: 0,
    ...overrides,
  };
}

afterEach(cleanup);

describe("chat delivery presentation", () => {
  it("shows a pending bubble immediately with a non-color status", () => {
    render(
      <MessageList
        messages={[]}
        outbox={[outbox()]}
        myId="u1"
        onRetry={vi.fn()}
      />,
    );

    expect(screen.getByText("Привет")).toBeTruthy();
    expect(screen.getByText("Отправляем…")).toBeTruthy();
    expect(screen.getByLabelText("Сообщение отправляется")).toBeTruthy();
  });

  it("shows a failed message with an accessible retry action", () => {
    const retry = vi.fn();
    render(
      <MessageList
        messages={[]}
        outbox={[outbox({ status: "failed", attempts: 1, lastError: "network" })]}
        myId="u1"
        onRetry={retry}
      />,
    );

    const button = screen.getByRole("button", { name: "Повторить отправку" });
    expect(screen.getByText("Не отправилось")).toBeTruthy();
    fireEvent.click(button);
    expect(retry).toHaveBeenCalledWith("c1");
  });

  it("does not render an optimistic duplicate once the receipt is confirmed", () => {
    render(
      <MessageList
        messages={[confirmed]}
        outbox={[outbox({ status: "failed", attempts: 1, lastError: "network" })]}
        myId="u1"
        onRetry={vi.fn()}
      />,
    );

    expect(screen.getAllByText("Привет")).toHaveLength(1);
    expect(screen.queryByText("Не отправилось")).toBeNull();
  });

  it("shows compact reconnect/offline/access-lost states", () => {
    const { rerender } = render(<ChatConnectionState state="reconnecting" />);
    expect(screen.getByRole("status").textContent).toContain("Восстанавливаем связь");

    rerender(<ChatConnectionState state="offline" />);
    expect(screen.getByRole("status").textContent).toContain("Нет сети");

    rerender(<ChatConnectionState state="access_lost" />);
    expect(screen.getByRole("alert").textContent).toContain("Чат больше недоступен");
  });

  it("prevents rapid double submit while the same composer action is in flight", async () => {
    let release!: () => void;
    const pending = new Promise<void>((resolve) => { release = resolve; });
    const submit = vi.fn().mockReturnValue(pending);
    const setText = vi.fn();
    render(
      <MessageComposer
        text="Привет"
        setText={setText}
        onSubmit={submit}
        disabled={false}
      />,
    );

    const send = screen.getByRole("button", { name: "Отправить" });
    fireEvent.click(send);
    fireEvent.click(send);
    expect(submit).toHaveBeenCalledTimes(1);
    expect(submit).toHaveBeenCalledWith("Привет");

    release();
    await waitFor(() => expect(send.hasAttribute("disabled")).toBe(false));
  });

  it("does not offer send for whitespace or terminal access loss", () => {
    const { rerender } = render(
      <MessageComposer text="   " setText={vi.fn()} onSubmit={vi.fn()} disabled={false} />,
    );
    expect(screen.getByRole("button", { name: "Отправить" }).hasAttribute("disabled")).toBe(true);

    rerender(
      <MessageComposer text="Текст" setText={vi.fn()} onSubmit={vi.fn()} disabled />,
    );
    expect(screen.getByRole("button", { name: "Отправить" }).hasAttribute("disabled")).toBe(true);
  });
});
