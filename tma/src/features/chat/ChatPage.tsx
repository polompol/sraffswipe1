import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Message, MatchModel } from "@/types/domain";
import { ShiftConflict, answerReschedule, cancelShift, confirmShift, proposeReschedule, setActualHours, fetchMatches, fetchMessages, sendMessage, track } from "@/api/endpoints";
import { getToken, useBackend, wsBaseURL } from "@/api/client";
import { showBackButton, haptic } from "@/telegram/sdk";
import { coin } from "@/lib/sfx";
import { fmtTime } from "@/lib/format";
import { useSession } from "@/store/session";
import { ReportSheet } from "@/components/ReportSheet";
import { Button } from "@/components/Button";
import { toast } from "@/components/Toast";
import { ErrorBox, SkeletonList } from "@/components/States";
import { EmptyState } from "@/components/EmptyState";
import { IconSend, IconBack, IconWarning, IconCheck, IconChat } from "@/components/Icons";

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
  const role = useSession((s) => s.role);
  const [text, setText] = useState("");
  const [reportOpen, setReportOpen] = useState(false);
  // Подтверждение смены берём из данных сервера, а не из локального стейта —
  // иначе при переоткрытии чата кнопка снова «Подтвердить», хотя ты уже нажал.
  const [match, setMatchState] = useState<MatchModel | null>(null);
  // Текст предупреждения о пересечении смен. Не запрет: человек может знать
  // то, чего не знаем мы (первую смену отменили, договорился о подмене).
  const [conflict, setConflict] = useState<string | null>(null);
  // Отмена смены — в два шага и с причиной: вторая сторона должна понимать,
  // что произошло, а не гадать. Заранее отменённая смена не бьёт по надёжности.
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  // Фактические часы: заведение уточняет длительность, если смена прошла
  // не как объявляли. Работник это видит и может открыть спор.
  const [hoursOpen, setHoursOpen] = useState(false);
  const [hoursValue, setHoursValue] = useState("8");
  const [hoursNote, setHoursNote] = useState("");
  // Перенос смены: заведение предлагает, работник отвечает.
  const [moveOpen, setMoveOpen] = useState(false);
  const [moveDate, setMoveDate] = useState("");
  const [moveStart, setMoveStart] = useState("10:00");
  const [moveEnd, setMoveEnd] = useState("18:00");

  useEffect(() => showBackButton(() => nav(-1)), [nav]);

  const { data: messages, isLoading, isError, refetch } = useQuery({
    queryKey: ["messages", matchId],
    queryFn: () => fetchMessages(matchId),
  });

  const { data: matches } = useQuery({ queryKey: ["matches"], queryFn: fetchMatches });
  const srvMatch = match ?? matches?.find((m) => m.id === matchId) ?? null;
  const iConfirmed = role === "employer"
    ? !!srvMatch?.confirmedByEmployer
    : !!srvMatch?.confirmedBySeeker;
  const bothConfirmed =
    !!srvMatch && srvMatch.confirmedBySeeker && srvMatch.confirmedByEmployer;

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
      toast("Не отправилось — нажмите отправить ещё раз", "error");
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

  const toMinutes = (t: string) => {
    const [h, m] = t.split(":").map(Number);
    return (h || 0) * 60 + (m || 0);
  };

  async function saveHours() {
    const minutes = Math.round(parseFloat(hoursValue.replace(",", ".")) * 60);
    try {
      const m = await setActualHours(matchId, minutes, hoursNote.trim());
      haptic("success");
      setMatchState(m);
      setHoursOpen(false);
      toast("Часы уточнены, работник уведомлён", "success");
      qc.invalidateQueries({ queryKey: ["messages", matchId] });
    } catch (e: any) {
      haptic("error");
      toast(e?.response?.data?.detail ?? "Не удалось сохранить часы", "error");
    }
  }

  async function proposeMove() {
    try {
      const m = await proposeReschedule(
        matchId, moveDate, toMinutes(moveStart), toMinutes(moveEnd));
      haptic("success");
      setMatchState(m);
      setMoveOpen(false);
      toast("Предложение отправлено работнику", "success");
      qc.invalidateQueries({ queryKey: ["messages", matchId] });
    } catch (e: any) {
      haptic("error");
      toast(e?.response?.data?.detail ?? "Не удалось предложить перенос", "error");
    }
  }

  async function answerMove(accept: boolean) {
    try {
      const m = await answerReschedule(matchId, accept);
      haptic(accept ? "success" : "warning");
      setMatchState(m);
      toast(accept ? "Перенос принят" : "Отказ отправлен", "success");
      qc.invalidateQueries({ queryKey: ["messages", matchId] });
      qc.invalidateQueries({ queryKey: ["matches"] });
    } catch {
      haptic("error");
      toast("Не удалось ответить", "error");
    }
  }

  async function doCancel() {
    try {
      const m = await cancelShift(matchId, cancelReason.trim());
      haptic("warning");
      setMatchState(m);
      setCancelOpen(false);
      setCancelReason("");
      toast("Смена отменена. Вторая сторона уведомлена", "success");
      qc.invalidateQueries({ queryKey: ["messages", matchId] });
      qc.invalidateQueries({ queryKey: ["matches"] });
    } catch (e: any) {
      haptic("error");
      toast(
        e?.response?.data?.detail ?? "Не удалось отменить смену",
        "error",
      );
    }
  }

  async function doConfirm(force = false) {
    try {
      const m = await confirmShift(matchId, force);
      track("confirm");
      haptic("success");
      coin();
      setMatchState(m);
      toast(
        m.confirmedBySeeker && m.confirmedByEmployer
          ? "Смена подтверждена обеими сторонами ✓"
          : "Готово! Ждём подтверждения второй стороны",
        "success",
      );
      qc.invalidateQueries({ queryKey: ["messages", matchId] });
      qc.invalidateQueries({ queryKey: ["matches"] });
    } catch (e) {
      // Пересечение с другой сменой — не ошибка, а вопрос. Решает человек:
      // бывает, что первую смену отменили, а статус ещё не обновился.
      if (e instanceof ShiftConflict) {
        haptic("warning");
        setConflict(e.detail);
        return;
      }
      haptic("error");
      toast("Не удалось подтвердить смену. Попробуйте ещё раз", "error");
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

        {isLoading && <SkeletonList rows={4} />}
        {isError && <ErrorBox onRetry={() => refetch()} />}
        {!isLoading && !isError && messages && messages.length === 0 && (
          <EmptyState
            icon={<IconChat size={34} />}
            title="Напишите первым"
            text="Спросите про адрес, время и что взять с собой — заведение ответит здесь."
          />
        )}

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
        {/* Подтверждение смены — главное действие экрана, поэтому primary.
            После подтверждения гасим до secondary: это уже статус, а не CTA. */}
        <div style={{ marginBottom: 8 }}>
          <Button
            variant={iConfirmed ? "secondary" : "primary"}
            disabled={iConfirmed}
            onClick={() => doConfirm()}
          >
            <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
              <IconCheck size={17} />
              {bothConfirmed
                ? "Смена подтверждена ✓"
                : iConfirmed
                  ? "Ждём подтверждения второй стороны"
                  : "Подтвердить смену"}
            </span>
          </Button>
          {/* Заведению: уточнить часы и предложить перенос. Раньше и то и
              другое решалось перепиской и ручными правками оператора. */}
          {role === "employer" && match &&
            !["cancelled", "expired"].includes(match.status) && (
            <div className="row" style={{ gap: 8, marginTop: 8, flexWrap: "wrap" }}>
              <button
                className="tag"
                style={{ flex: 1, minWidth: 130, cursor: "pointer" }}
                onClick={() => setHoursOpen(true)}
              >
                Уточнить часы
              </button>
              {!match.seekerCheckedIn && !match.employerCheckedIn && (
                <button
                  className="tag"
                  style={{ flex: 1, minWidth: 130, cursor: "pointer" }}
                  onClick={() => setMoveOpen(true)}
                >
                  Перенести смену
                </button>
              )}
            </div>
          )}

          {/* Работнику: заведение предложило другой день — надо ответить. */}
          {role === "seeker" && match?.rescheduleDate && (
            <div
              className="card"
              style={{ marginTop: 8, borderColor: "var(--gold)" }}
            >
              <div style={{ fontWeight: 700, marginBottom: 4 }}>
                Заведение предлагает перенос
              </div>
              <p className="muted" style={{ margin: "0 0 10px", fontSize: 14 }}>
                {match.rescheduleDate}
                {match.rescheduleStart != null &&
                  ` · ${fmtTime(match.rescheduleStart)}–${fmtTime(match.rescheduleEnd ?? 0)}`}
              </p>
              <div className="row" style={{ gap: 8 }}>
                <Button onClick={() => answerMove(true)}>Согласен</Button>
                <Button variant="ghost" onClick={() => answerMove(false)}>
                  Не смогу
                </Button>
              </div>
            </div>
          )}

          {/* Отменить можно, пока смена не началась. Без этой кнопки у
              человека оставался один выход — просто не прийти. */}
          {match && !["completed", "cancelled"].includes(match.status) &&
            !match.seekerCheckedIn && !match.employerCheckedIn && (
            <button
              className="tag"
              style={{
                marginTop: 8,
                cursor: "pointer",
                color: "var(--danger)",
                borderColor: "var(--danger)",
              }}
              onClick={() => setCancelOpen(true)}
            >
              Не смогу выйти
            </button>
          )}
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

      {hoursOpen && (
        <div className="sheet-backdrop" onClick={() => setHoursOpen(false)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <h2 className="h2" style={{ marginTop: 0 }}>Сколько часов вышло</h2>
            <p className="muted" style={{ marginBottom: 12 }}>
              Опоздал, ушёл раньше или задержался — оплата и комиссия
              пересчитаются по факту. Работник увидит это в чате.
            </p>
            <div className="form-label">Часов</div>
            <input
              className="input"
              inputMode="decimal"
              value={hoursValue}
              onChange={(e) => setHoursValue(e.target.value)}
            />
            <div className="form-label" style={{ marginTop: 12 }}>
              Комментарий — по желанию
            </div>
            <input
              className="input"
              maxLength={200}
              placeholder="Отпустили раньше"
              value={hoursNote}
              onChange={(e) => setHoursNote(e.target.value)}
            />
            <div style={{ display: "grid", gap: 10, marginTop: 14 }}>
              <Button block onClick={saveHours}>Сохранить</Button>
              <Button variant="ghost" block onClick={() => setHoursOpen(false)}>
                Отмена
              </Button>
            </div>
          </div>
        </div>
      )}

      {moveOpen && (
        <div className="sheet-backdrop" onClick={() => setMoveOpen(false)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <h2 className="h2" style={{ marginTop: 0 }}>Перенести смену</h2>
            <p className="muted" style={{ marginBottom: 12 }}>
              Человек уже согласился на прежние условия, поэтому перенос — это
              предложение: он может не смочь в новое время.
            </p>
            <div className="form-label">Новая дата</div>
            <input
              className="input"
              type="date"
              value={moveDate}
              onChange={(e) => setMoveDate(e.target.value)}
            />
            <div className="row" style={{ gap: 10, marginTop: 12 }}>
              <div style={{ flex: 1 }}>
                <div className="form-label">Начало</div>
                <input
                  className="input"
                  type="time"
                  value={moveStart}
                  onChange={(e) => setMoveStart(e.target.value)}
                />
              </div>
              <div style={{ flex: 1 }}>
                <div className="form-label">Конец</div>
                <input
                  className="input"
                  type="time"
                  value={moveEnd}
                  onChange={(e) => setMoveEnd(e.target.value)}
                />
              </div>
            </div>
            <div style={{ display: "grid", gap: 10, marginTop: 14 }}>
              <Button block disabled={!moveDate} onClick={proposeMove}>
                Предложить перенос
              </Button>
              <Button variant="ghost" block onClick={() => setMoveOpen(false)}>
                Отмена
              </Button>
            </div>
          </div>
        </div>
      )}

      {cancelOpen && (
        <div className="sheet-backdrop" onClick={() => setCancelOpen(false)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <h2 className="h2" style={{ marginTop: 0 }}>Отменить смену?</h2>
            <p className="muted" style={{ marginBottom: 12 }}>
              Вторая сторона получит уведомление сразу. Чем раньше
              предупредите, тем лучше: заранее отменённая смена не влияет на
              надёжность профиля, за несколько часов до начала — влияет.
            </p>
            <input
              className="input"
              placeholder="Причина (по желанию)"
              maxLength={200}
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
            />
            <div style={{ display: "grid", gap: 10, marginTop: 14 }}>
              <Button variant="danger" block onClick={doCancel}>
                Отменить смену
              </Button>
              <Button variant="ghost" block onClick={() => setCancelOpen(false)}>
                Назад
              </Button>
            </div>
          </div>
        </div>
      )}

      {conflict && (
        <div className="sheet-backdrop" onClick={() => setConflict(null)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <h2 className="h2" style={{ marginTop: 0 }}>Смены пересекаются</h2>
            <p className="muted" style={{ marginBottom: 16 }}>{conflict}</p>
            <div style={{ display: "grid", gap: 10 }}>
              <Button
                block
                onClick={() => {
                  setConflict(null);
                  void doConfirm(true);
                }}
              >
                Всё равно беру
              </Button>
              <Button variant="ghost" block onClick={() => setConflict(null)}>
                Отменить
              </Button>
            </div>
          </div>
        </div>
      )}

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
