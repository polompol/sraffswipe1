import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Message } from "@/types/domain";
import { confirmShift, fetchMessages, sendMessage } from "@/api/endpoints";
import { showBackButton, haptic } from "@/telegram/sdk";

export function ChatPage() {
  const { matchId = "" } = useParams();
  const nav = useNavigate();
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const [confirmed, setConfirmed] = useState(false);

  useEffect(() => showBackButton(() => nav(-1)), [nav]);

  const { data: messages } = useQuery({
    queryKey: ["messages", matchId],
    queryFn: () => fetchMessages(matchId),
  });

  async function send() {
    const t = text.trim();
    if (!t) return;
    setText("");
    await sendMessage(matchId, t);
    qc.invalidateQueries({ queryKey: ["messages", matchId] });
  }

  async function doConfirm() {
    haptic("success");
    await confirmShift(matchId);
    setConfirmed(true);
    qc.invalidateQueries({ queryKey: ["messages", matchId] });
    qc.invalidateQueries({ queryKey: ["matches"] });
  }

  return (
    <div className="app">
      <div className="page" style={{ paddingBottom: 150 }}>
        <div className="row" style={{ marginBottom: 12 }}>
          <button className="tab" style={{ flex: "none", width: "auto" }} onClick={() => nav(-1)}>
            <span className="ico">‹</span>
          </button>
          <b>Чат по смене</b>
        </div>

        {messages?.map((m: Message) => {
          if (m.isSystem) return <div key={m.id} className="bubble system">{m.text}</div>;
          const mine = m.senderId === "me";
          return (
            <div key={m.id} className={`bubble ${mine ? "mine" : "theirs"}`}>
              {m.text}
            </div>
          );
        })}
      </div>

      <div
        style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          maxWidth: 520,
          margin: "0 auto",
          padding: "8px 12px calc(8px + env(safe-area-inset-bottom))",
          background: "var(--surface)",
          borderTop: "1px solid var(--border)",
        }}
      >
        <button
          className="btn ghost"
          style={{ marginBottom: 8 }}
          disabled={confirmed}
          onClick={doConfirm}
        >
          {confirmed ? "✓ Вы подтвердили смену" : "🤝 Подтвердить смену"}
        </button>
        <div className="row">
          <input
            className="input"
            placeholder="Сообщение…"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
          />
          <button
            className="btn"
            style={{ width: 52, flex: "none", padding: 0, height: 48 }}
            onClick={send}
          >
            ➤
          </button>
        </div>
      </div>
    </div>
  );
}
