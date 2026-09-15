import type { Message } from "@/types/domain";
import { msgTime } from "@/lib/format";
import type { OutboxEntry } from "./chatPersistence";

interface Props {
  messages: Message[];
  outbox: OutboxEntry[];
  myId: string;
  onRetry: (clientMessageId: string) => void;
}

type TimelineItem =
  | { kind: "confirmed"; at: string; message: Message }
  | { kind: "outbox"; at: string; entry: OutboxEntry };

function statusText(entry: OutboxEntry): string {
  if (entry.status === "sending" || entry.status === "pending") return "Отправляем…";
  if (entry.lastError === "rate_limit") return "Слишком часто — попробуем позже";
  if (entry.lastError === "integrity") return "Не отправилось";
  if (entry.lastError === "forbidden") return "Чат недоступен";
  return "Не отправилось";
}

/** Server truth plus unresolved optimistic messages, deduplicated by receipt. */
export function MessageList({ messages, outbox, myId, onRetry }: Props) {
  const confirmedReceipts = new Set(
    messages
      .filter((message) => message.senderId === myId && message.clientMessageId)
      .map((message) => message.clientMessageId as string),
  );

  const timeline: TimelineItem[] = [
    ...messages.map((message) => ({
      kind: "confirmed" as const,
      at: message.createdAt,
      message,
    })),
    ...outbox
      .filter((entry) => !confirmedReceipts.has(entry.clientMessageId))
      .map((entry) => ({ kind: "outbox" as const, at: entry.createdAt, entry })),
  ].sort((a, b) => a.at.localeCompare(b.at));

  return (
    <>
      {timeline.map((item) => {
        if (item.kind === "confirmed") {
          const message = item.message;
          if (message.isSystem) {
            return <div key={message.id} className="bubble system">{message.text}</div>;
          }
          const mine = message.senderId === myId;
          return (
            <div key={message.id} className={`bubble ${mine ? "mine" : "theirs"}`}>
              {message.text}
              <span className="bubble-at">{msgTime(message.createdAt)}</span>
            </div>
          );
        }

        const entry = item.entry;
        const sending = entry.status === "pending" || entry.status === "sending";
        const retryable = entry.status === "failed" && entry.lastError !== "rate_limit";
        return (
          <div
            key={`outbox:${entry.clientMessageId}`}
            className="bubble mine"
            aria-label={sending ? "Сообщение отправляется" : undefined}
            style={{ opacity: sending ? 0.78 : 1 }}
          >
            {entry.text}
            <span className="bubble-at">{msgTime(entry.createdAt)}</span>
            <div
              className="muted"
              aria-live={entry.status === "failed" ? "polite" : undefined}
              style={{ fontSize: "var(--text-xs)", marginTop: 4 }}
            >
              {statusText(entry)}
              {retryable && (
                <button
                  type="button"
                  className="text-btn"
                  aria-label="Повторить отправку"
                  onClick={() => onRetry(entry.clientMessageId)}
                  style={{ marginLeft: 6, minHeight: 44 }}
                >
                  Повторить
                </button>
              )}
            </div>
          </div>
        );
      })}
    </>
  );
}
