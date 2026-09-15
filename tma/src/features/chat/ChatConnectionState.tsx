export type ChatConnection =
  | "connected"
  | "reconnecting"
  | "offline"
  | "access_lost";

interface Props {
  state: ChatConnection;
}

/** Compact connection feedback that never hides the message history. */
export function ChatConnectionState({ state }: Props) {
  if (state === "connected") return null;

  const terminal = state === "access_lost";
  const text = state === "offline"
    ? "Нет сети — сообщения отправятся после подключения"
    : terminal
      ? "Чат больше недоступен"
      : "Восстанавливаем связь…";

  return (
    <div
      role={terminal ? "alert" : "status"}
      className="muted"
      style={{
        textAlign: "center",
        fontSize: "var(--text-xs)",
        padding: "6px 8px",
      }}
    >
      {text}
    </div>
  );
}
