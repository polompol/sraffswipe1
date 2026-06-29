import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Message } from "@/types/domain";
import { confirmShift, fetchMessages, sendMessage, track } from "@/api/endpoints";
import { getToken, useBackend, wsBaseURL } from "@/api/client";
import { showBackButton, haptic } from "@/telegram/sdk";
import { useSession } from "@/store/session";
import { ReportSheet } from "@/components/ReportSheet";
import { Button } from "@/components/Button";
import { IconSend, IconBack, IconWarning, IconCheck } from "@/components/Icons";

// Быстрые ответы — частые фразы в один тап (экономят время, снижают трение).
const QUICK_REPLIES = [
  "Здравствуйте!",
  "Готов выйти на смену",
  "Во сколько выходить?",
  "Какой адрес?",
  "Что взять с собой?",
];

export function ChatPage() {
  const { matchId = "" } = useParams();
  const nav = useNavigate();
  const qc = useQueryClient();
  const myId = useSession((s) => s.userId);
  const [text, setText] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);

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

  async function deliver(t: string) {
    try {
      const msg = await sendMessage(matchId, t);
      appendMessage(msg); // мгновенно показываем; WS-echo дедуплицируется
    } catch {
      haptic("error");
      setText(t); // вернуть текст, чтобы не потерять сообщение
    }
  }

  async function send() {
    const t = text.trim();
    if (!t) return;
    setText("");
    await deliver(t);
  }

  function quickReply(t: string) {
    haptic("light");
    void deliver(t);
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
          <button className="icon-btn" aria-label="Назад" onClick={() => nav(-1)}>
            <IconBack size={22} />
          </button>
          <b style={{ flex: 1 }}>Чат по смене</b>
          <button
            className="icon-btn"
            style={{ color: "var(--muted)" }}
            aria-label="Пожаловаться"
            onClick={() => setReportOpen(true)}
          >
            <IconWarning size={20} />
          </button>
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
        <div
          style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 8, marginBottom: 2 }}
        >
          {QUICK_REPLIES.map((q) => (
            <button
              key={q}
              className="tag"
              style={{ cursor: "pointer", whiteSpace: "nowrap", flex: "none", borderColor: "var(--border)" }}
              onClick={() => quickReply(q)}
            >
              {q}
            </button>
          ))}
        </div>
        <div style={{ marginBottom: 8 }}>
          <Button variant="ghost" disabled={confirmed} onClick={doConfirm}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
              <IconCheck size={17} />
              {confirmed ? "Вы подтвердили смену" : "Подтвердить смену"}
            </span>
          </Button>
        </div>
        <div className="row">
          <input
            className="input"
            placeholder="Сообщение…"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
          />
          <Button
            block={false}
            aria-label="Отправить"
            onClick={send}
            style={{ width: 52, flex: "none", padding: 0 }}
          >
            <IconSend size={20} />
          </Button>
        </div>
      </div>

      {reportOpen && (
        <ReportSheet
          targetType="match"
          targetId={matchId}
          onClose={() => setReportOpen(false)}
        />
      )}
    </div>
  );
}
