import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Message } from "@/types/domain";
import { confirmShift, fetchMessages, sendMessage, track } from "@/api/endpoints";
import { getToken, useBackend, wsBaseURL } from "@/api/client";
import { showBackButton, haptic } from "@/telegram/sdk";
import { useSession } from "@/store/session";

export function ChatPage() {
  const { matchId = "" } = useParams();
  const nav = useNavigate();
  const qc = useQueryClient();
  const myId = useSession((s) => s.userId);
  const [text, setText] = useState("");
  const [confirmed, setConfirmed] = useState(false);

  useEffect(() => showBackButton(() => nav(-1)), [nav]);

  const { data: messages } = useQuery({
    queryKey: ["messages", matchId],
    queryFn: () => fetchMessages(matchId),
  });

  // Добавить сообщение в кэш с дедупликацией по id (echo от WS не задвоит).
  function appendMessage(msg: Message) {
    qc.setQueryData<Message[]>(["messages", matchId], (old) => {
      const list = old ?? [];
      if (list.some((m) => m.id === msg.id)) return list;
      return [...list, msg];
    });
  }

  // Живой чат через WebSocket (только при реальном backend).
  useEffect(() => {
    if (!useBackend || !matchId) return;
    const token = getToken();
    const ws = new WebSocket(
      `${wsBaseURL}/ws/chat/${matchId}?token=${token ?? ""}`,
    );
    ws.onmessage = (ev) => {
      try {
        const raw = JSON.parse(ev.data);
        appendMessage({
          id: raw.id,
          chatId: raw.match_id ?? matchId,
          senderId: raw.sender_id,
          text: raw.text,
          isSystem: Boolean(raw.is_system),
          timestamp: raw.created_at ?? new Date().toISOString(),
        });
      } catch {
        /* ignore malformed frame */
      }
    };
    return () => ws.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchId]);

  async function send() {
    const t = text.trim();
    if (!t) return;
    setText("");
    try {
      const msg = await sendMessage(matchId, t);
      appendMessage(msg); // мгновенно показываем; WS-echo дедуплицируется
    } catch {
      haptic("error");
      setText(t); // вернуть текст, чтобы не потерять сообщение
    }
  }

  async function doConfirm() {
    try {
      await confirmShift(matchId);
      track("confirm");
      haptic("success");
      setConfirmed(true);
      qc.invalidateQueries({ queryKey: ["messages", matchId] });
      qc.invalidateQueries({ queryKey: ["matches"] });
    } catch {
      haptic("error");
    }
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
          const mine = m.senderId === (myId ?? "me");
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
            aria-label="Отправить"
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
