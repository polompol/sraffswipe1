import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Message, MatchModel } from "@/types/domain";
import { ShiftConflict, answerReschedule, cancelShift, confirmShift, proposeReschedule, setActualHours, fetchMatches, track } from "@/api/endpoints";
import { useBackend } from "@/api/client";
import { showBackButton, haptic } from "@/telegram/sdk";
import { coin } from "@/lib/sfx";
import {
  fmtTime,
  numRu,
  shiftDayLabel,
  shiftEnded,
  shiftLengthHours,
  shiftStarted,
  shiftWhen,
} from "@/lib/format";
import { apiError } from "@/lib/errors";
import { useSession } from "@/store/session";
import { ReportSheet } from "@/components/ReportSheet";
import { Sheet } from "@/components/Sheet";
import { Button } from "@/components/Button";
import { toast } from "@/components/Toast";
import { ErrorBox, SkeletonList } from "@/components/States";
import { useChatHistory } from "./useChatHistory";
import { useChatSocket } from "./useChatSocket";
import { useChatDraft } from "./useChatDraft";
import { useChatOutbox } from "./useChatOutbox";
import { ChatConnectionState, type ChatConnection } from "./ChatConnectionState";
import { MessageComposer } from "./MessageComposer";
import { MessageList } from "./MessageList";
import { hasMatchAction } from "@/features/matches/matchActions";
import { useMatchActionRunner } from "@/features/matches/useMatchActionRunner";
import { EmptyState } from "@/components/EmptyState";
import { IconBack, IconWarning, IconCheck, IconChat, IconMore } from "@/components/Icons";

// Быстрые ответы — частые фразы одним нажатием. У сторон они РАЗНЫЕ: заведению
// предлагались реплики работника («Какой адрес?», «Что взять с собой?»), то
// есть человеку показывали вопросы, ответы на которые он и должен дать.
// Мужского рода тут тоже быть не должно: половина бариста и официантов —
// женщины, и подсказка «Готов выйти» им не подходит.
// Приветствие — первое в списке и первое, что перестаёт быть нужным: после
// того как человек написал сам, кнопка «Здравствуйте!» под его же репликой
// выглядит так, будто приложение не заметило разговора. Остальные подсказки
// — настоящие вопросы, они полезны и на третий день переписки.
const GREETING = "Здравствуйте!";
const QUICK_REPLIES_SEEKER = [
  GREETING,
  "Выйду на смену",
  "Во сколько выходить?",
  "Какой адрес?",
  "Что взять с собой?",
];
const QUICK_REPLIES_EMPLOYER = [
  GREETING,
  "Ждём вас к началу смены",
  "Спросите администратора на входе",
  "Во сколько будете?",
  "Форма: чёрный верх, фартук дадим",
];

export function ChatPage() {
  const { matchId = "" } = useParams();
  const nav = useNavigate();
  const qc = useQueryClient();
  const myId = useSession((s) => s.userId);
  const role = useSession((s) => s.role);
  const actionRunner = useMatchActionRunner();
  const chatUserId = myId ?? "me";
  const chatRole = role === "employer" ? "employer" : "seeker";
  const draft = useChatDraft({ userId: chatUserId, role: chatRole, matchId });
  const text = draft.text;
  // Есть ли живое соединение. Нужно, чтобы честно сказать человеку «связь
  // потеряна, восстанавливаем» вместо молчаливого чата, который выглядит
  // рабочим, но ничего не получает.
  const [live, setLive] = useState(true);
  const [socketAccessLost, setSocketAccessLost] = useState(false);
  const [online, setOnline] = useState(() =>
    typeof navigator === "undefined" ? true : navigator.onLine,
  );
  const [reportOpen, setReportOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
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
  // Одно меню на все редкие действия: «что-то пошло не так».
  const [troubleOpen, setTroubleOpen] = useState(false);
  const [moveDate, setMoveDate] = useState("");
  const [moveStart, setMoveStart] = useState("10:00");
  const [moveEnd, setMoveEnd] = useState("18:00");

  // Прокрутка к последнему сообщению при открытии и на каждое новое.
  const bottomRef = useRef<HTMLDivElement | null>(null);
  // Высота нижней панели — меряем, а не вписываем числом.
  //
  // Раньше под списком стоял отступ в 150 точек. Панель внизу собирается из
  // разного набора: ряд быстрых ответов, «Подтвердить смену», «Изменить
  // смену», поле ввода — вместе за 230. На экране 320×568 последнее сообщение
  // наполовину уезжало под неё, и человек не видел, что ему только что
  // ответили.
  const barRef = useRef<HTMLDivElement | null>(null);
  const [barH, setBarH] = useState(150);

  useEffect(() => showBackButton(() => nav(-1)), [nav]);

  const {
    messages,
    isLoading,
    isError,
    refetch,
    hasOlder,
    olderLoading,
    loadOlder,
    appendMessage,
  } = useChatHistory(matchId);

  const outbox = useChatOutbox({
    matchId,
    userId: chatUserId,
    role: chatRole,
    confirmedMessages: messages ?? [],
    live: (!useBackend || live) && online && !socketAccessLost,
    appendConfirmed: appendMessage,
  });
  const accessLost = socketAccessLost || outbox.terminalAccessLost;
  const connectionState: ChatConnection = accessLost
    ? "access_lost"
    : !online
      ? "offline"
      : useBackend && !live
        ? "reconnecting"
        : "connected";

  useEffect(() => {
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  useEffect(() => setSocketAccessLost(false), [matchId]);

  // К последнему сообщению — при открытии чата и на каждое новое.
  //
  // Следим именно за ПОСЛЕДНИМ сообщением, а не за всем списком: когда
  // догружается старая переписка, список меняется, а прокручивать вниз нельзя
  // — человек только что нажал «показать более ранние» и смотрит наверх.
  // Что я в этом чате уже отправлял — чтобы не предлагать это снова кнопкой.
  const mySent = new Set([
    ...(messages ?? [])
      .filter((m: Message) => !m.isSystem && m.senderId === chatUserId)
      .map((m: Message) => m.text.trim()),
    ...outbox.entries.map((entry) => entry.text.trim()),
  ]);

  const lastOutbox = outbox.entries.length
    ? outbox.entries[outbox.entries.length - 1]
    : null;
  const lastId = `${messages?.length ? messages[messages.length - 1].id : ""}|${lastOutbox?.clientMessageId ?? ""}:${lastOutbox?.status ?? ""}`;
  // Прокручиваем и когда меняется высота панели: кнопка «Подтвердить смену»
  // появляется не сразу, и без этого список оставался стоять как был.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [lastId, barH]);

  useEffect(() => {
    const el = barRef.current;
    if (!el) return;
    const measure = () => setBarH(el.offsetHeight);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const { data: matches } = useQuery({ queryKey: ["matches"], queryFn: fetchMatches });
  const srvMatch = match ?? matches?.find((m) => m.id === matchId) ?? null;
  const iConfirmed = role === "employer"
    ? !!srvMatch?.confirmedByEmployer
    : !!srvMatch?.confirmedBySeeker;
  const bothConfirmed =
    !!srvMatch && srvMatch.confirmedBySeeker && srvMatch.confirmedByEmployer;
  // На живом backend разрешения state-changing действий принадлежат серверу.
  // Локальные status/time правила остаются только для mock/demo, чтобы демо
  // работало без сервера и при этом production никогда не угадывал доступ.
  const alive =
    !!srvMatch && !["cancelled", "expired", "completed"].includes(srvMatch.status);
  const notStarted =
    !!srvMatch
    && !srvMatch.seekerCheckedIn
    && !srvMatch.employerCheckedIn
    && !shiftStarted(srvMatch);
  const canConfirm = !!srvMatch && (useBackend
    ? hasMatchAction(srvMatch, "confirm")
    : !iConfirmed && alive);
  const canCancel = !!srvMatch && (useBackend
    ? hasMatchAction(srvMatch, "cancel")
    : alive && notStarted);
  const canMove = role === "employer" && !!srvMatch && (useBackend
    ? hasMatchAction(srvMatch, "propose_reschedule")
    : alive && notStarted);
  const canSetHours = role === "employer" && !!srvMatch && (useBackend
    ? hasMatchAction(srvMatch, "set_hours")
    : alive && shiftEnded(srvMatch));
  const canAcceptMove = role === "seeker" && !!srvMatch && (useBackend
    ? hasMatchAction(srvMatch, "accept_reschedule")
    : !!srvMatch.rescheduleDate);
  const canDeclineMove = role === "seeker" && !!srvMatch && (useBackend
    ? hasMatchAction(srvMatch, "decline_reschedule")
    : !!srvMatch.rescheduleDate);
  const canAct = canCancel || canMove || canSetHours;


  useChatSocket(matchId, {
    onMessage: appendMessage,
    onSystem: () => {
      // Локальную копию мэтча сбрасываем: иначе она навсегда перекрывает
      // свежие данные сервера (`match ?? matches?.find(...)`).
      setMatchState(null);
      qc.invalidateQueries({ queryKey: ["matches"] });
    },
    onLive: setLive,
    onAccessLost: () => setSocketAccessLost(true),
  });

  async function sendComposer(submitted: string) {
    const accepted = await outbox.sendText(submitted);
    if (accepted) {
      draft.clearIfUnchanged(submitted);
      haptic("light");
      return;
    }
    haptic("error");
    toast("Не удалось сохранить сообщение — текст остался", "error");
  }

  async function quickReply(t: string) {
    haptic("light");
    const accepted = await outbox.sendText(t);
    if (!accepted) toast("Не удалось сохранить сообщение", "error");
  }

  const toMinutes = (t: string) => {
    const [h, m] = t.split(":").map(Number);
    return (h || 0) * 60 + (m || 0);
  };

  async function saveHours() {
    const minutes = Math.round(parseFloat(hoursValue.replace(",", ".")) * 60);
    try {
      await actionRunner.run(matchId, "set_hours", async () => {
        const m = await setActualHours(matchId, minutes, hoursNote.trim());
        haptic("success");
        setMatchState(m);
        setHoursOpen(false);
        toast("Часы сохранили — работник уже видит", "success");
        qc.invalidateQueries({ queryKey: ["messages", matchId] });
      });
    } catch (e: any) {
      haptic("error");
      toast(apiError(e, "Часы не сохранились — попробуйте ещё раз"), "error");
    }
  }

  async function proposeMove() {
    try {
      await actionRunner.run(matchId, "propose_reschedule", async () => {
        const m = await proposeReschedule(
          matchId, moveDate, toMinutes(moveStart), toMinutes(moveEnd));
        haptic("success");
        setMatchState(m);
        setMoveOpen(false);
        toast("Предложили перенос — ждём ответа", "success");
        qc.invalidateQueries({ queryKey: ["messages", matchId] });
      });
    } catch (e: any) {
      haptic("error");
      toast(apiError(e, "Перенос не предложился — попробуйте ещё раз"), "error");
    }
  }

  async function answerMove(accept: boolean) {
    const action = accept ? "accept_reschedule" : "decline_reschedule";
    try {
      await actionRunner.run(matchId, action, async () => {
        const m = await answerReschedule(matchId, accept);
        haptic(accept ? "success" : "warning");
        setMatchState(m);
        toast(accept ? "Смена перенесена ✓" : "Ответили: выйти не сможете", "success");
        qc.invalidateQueries({ queryKey: ["messages", matchId] });
        qc.invalidateQueries({ queryKey: ["matches"] });
      });
    } catch {
      haptic("error");
      toast("Ответ не ушёл — попробуйте ещё раз", "error");
    }
  }

  async function doCancel() {
    try {
      await actionRunner.run(matchId, "cancel", async () => {
        const m = await cancelShift(matchId, cancelReason.trim());
        haptic("warning");
        setMatchState(m);
        setCancelOpen(false);
        setCancelReason("");
        toast(
          role === "employer"
            ? "Смена отменена — работник уже знает"
            : "Смена отменена — заведение уже знает",
          "success",
        );
        qc.invalidateQueries({ queryKey: ["messages", matchId] });
        qc.invalidateQueries({ queryKey: ["matches"] });
      });
    } catch (e: any) {
      haptic("error");
      toast(
        apiError(e, "Смена не отменилась — попробуйте ещё раз"),
        "error",
      );
    }
  }

  async function doConfirm(force = false) {
    try {
      await actionRunner.run(matchId, "confirm", async () => {
        const m = await confirmShift(matchId, force);
        track("confirm");
        haptic("success");
        coin();
        setMatchState(m);
        toast(
          m.confirmedBySeeker && m.confirmedByEmployer
            ? "Договорились ✓ Смена подтверждена"
            : role === "employer"
              ? "Готово! Ждём, когда работник подтвердит"
              : "Готово! Ждём, когда заведение подтвердит",
          "success",
        );
        qc.invalidateQueries({ queryKey: ["messages", matchId] });
        qc.invalidateQueries({ queryKey: ["matches"] });
      });
    } catch (e) {
      // Пересечение с другой сменой — не ошибка, а вопрос. Решает человек:
      // бывает, что первую смену отменили, а статус ещё не обновился.
      if (e instanceof ShiftConflict) {
        haptic("warning");
        setConflict(e.detail);
        return;
      }
      haptic("error");
      toast("Смена не подтвердилась — попробуйте ещё раз", "error");
    }
  }

  return (
    <div className="app">
      <div className="page chat" style={{ paddingBottom: 0 }}>
        <div className="row" style={{ marginBottom: 12 }}>
          <button className="icon-btn" aria-label="Назад" onClick={() => nav(-1)}>
            <IconBack size={22} />
          </button>
          {/* Когда смена — прямо в шапке. Раньше в чате не было ни даты, ни
              времени: человек договорился и потом искал их в переписке. */}
          <span className="grow">
            {/* Тот же класс, что в списке смен: сюда приходит название,
                которое человек вписал сам. Без него «КофейняНаБольшойДмитровке»
                наезжало на кнопку жалобы справа, а длинное название с
                пробелами разворачивало шапку на четыре строки. */}
            <b className="match-name" style={{ display: "block" }}>
              {(role === "employer" ? srvMatch?.seekerName : srvMatch?.companyName)
                || "Чат по смене"}
            </b>
            {srvMatch && shiftWhen(srvMatch) && (
              <span className="muted small">
                {shiftWhen(srvMatch)}
              </span>
            )}
          </span>
          {/* Жалоба ушла под «ещё»: знак предупреждения в шапке чата стоял
              рядом с именем собеседника и мозолил глаз при каждом сообщении,
              хотя жалуются редко. Найти её по-прежнему можно за одно
              нажатие — так же, как в списке смен. */}
          <button
            className="icon-btn"
            style={{ color: "var(--muted)" }}
            aria-label="Ещё действия"
            onClick={() => setMoreOpen(true)}
          >
            <IconMore size={20} />
          </button>
        </div>

        <ChatConnectionState state={connectionState} />
        {isLoading && <SkeletonList rows={4} />}
        {isError && <ErrorBox onRetry={() => refetch()} />}
        {!isLoading && !isError && messages && messages.length === 0 && outbox.entries.length === 0 && (
          <EmptyState
            fill
            icon={<IconChat size={34} />}
            title="Напишите первым"
            text={
              role === "employer"
                ? "Подскажите адрес, во сколько подойти и что взять с собой — человек ответит здесь."
                : "Спросите про адрес, время и что взять с собой — заведение ответит здесь."
            }
          />
        )}

        {/* Лента переписки прижата к низу — см. .chat-list в index.css. */}
        <div className="chat-list">
        {hasOlder && (
          <button
            onClick={loadOlder}
            disabled={olderLoading}
            className="text-btn"
            style={{ display: "block", margin: "0 auto 10px", padding: "0 14px" }}
          >
            {olderLoading ? "Загружаем…" : "Показать старые сообщения"}
          </button>
        )}

        <MessageList
          messages={messages ?? []}
          outbox={outbox.entries}
          myId={chatUserId}
          onRetry={(clientMessageId) => void outbox.retry(clientMessageId)}
        />
        </div>
        {/* Якорь для прокрутки и одновременно распорка под нижнюю панель.
            Без него чат открывался на самом первом сообщении: свежие
            оставались ниже экрана, за панелью ввода. Человек отправлял
            сообщение, не видел его и жал «отправить» ещё раз.

            Высота у распорки — измеренная высота панели, а не число. Раньше
            под списком стоял отступ в 150 точек, а панель на узком экране
            вырастала за 230: последнее сообщение уезжало под неё наполовину.
            Распоркой это чинится само — прокрутка ставит её низ на низ
            экрана, и последний пузырь оказывается ровно над панелью. */}
        <div ref={bottomRef} style={{ height: barH + 12 }} />
      </div>

      <div
        ref={barRef}
        style={{
          position: "fixed",
          // --kb — сколько экрана закрыла клавиатура (см. lib/keyboard.ts).
          // Без этого на айфоне поле ввода и кнопка «Отправить» оказывались
          // ПОД клавиатурой: человек печатал вслепую.
          bottom: "var(--kb, 0px)",
          left: 0,
          right: 0,
          maxWidth: 520,
          margin: "0 auto",
          padding: "8px 12px calc(8px + var(--app-safe-bottom))",
          paddingLeft: "max(12px, var(--app-safe-left))",
          paddingRight: "max(12px, var(--app-safe-right))",
          background: "var(--surface)",
          borderTop: "1px solid var(--border)",
        }}
      >
        {/* Лента быстрых ответов прокручивается вбок, но выглядела как
            обрезанная строка: третья подсказка упиралась в край экрана на
            середине слова, и понять, что там есть продолжение, было нельзя.
            Плавное затухание у правого края читается как «дальше есть ещё».
            scrollPadding — чтобы первый чип не прилипал к самому краю. */}
        <div
          className="quick-row"
          style={{
            display: text.trim() ? "none" : "flex",
            gap: 8,
            overflowX: "auto",
            paddingBottom: 8,
            marginBottom: 2,
          }}
        >
          {/* Уже сказанное не предлагаем во второй раз. Заведение писало
              «Ждём вас к началу смены», эта же фраза висела кнопкой прямо под
              перепиской — человек видел свою реплику и предложение повторить
              её. Сравниваем по своим отправленным сообщениям. */}
          {(role === "employer" ? QUICK_REPLIES_EMPLOYER : QUICK_REPLIES_SEEKER)
            .filter((q) => !mySent.has(q))
            // Здороваться предлагаем только пока человек молчит.
            .filter((q) => q !== GREETING || mySent.size === 0)
            .map((q) => (
            <button
              key={q}
              className="tag"
              style={{ cursor: "pointer", whiteSpace: "nowrap", flex: "none", borderColor: "var(--border-strong)" }}
              disabled={accessLost}
              onClick={() => void quickReply(q)}
            >
              {q}
            </button>
          ))}
        </div>
        {/* Подтверждение смены — главное действие экрана, поэтому primary.
            После подтверждения гасим до secondary: это уже статус, а не CTA. */}
        <div style={{ marginBottom: 8 }}>
          {(!useBackend || canConfirm || iConfirmed) && (
          <Button
            variant={iConfirmed ? "secondary" : "primary"}
            disabled={actionRunner.isPending(matchId, "confirm") || (useBackend ? !canConfirm : iConfirmed)}
            onClick={() => doConfirm()}
          >
            <span className="inline">
              <IconCheck size={17} />
              {/* Без второй галочки в тексте: слева уже стоит иконка, и
                  вместе получалось «✓ Смена подтверждена ✓». */}
              {actionRunner.isPending(matchId, "confirm")
                ? "Подтверждаем…"
                : bothConfirmed
                  ? "Смена подтверждена"
                  : iConfirmed
                    ? role === "employer"
                      ? "Ждём ответа работника"
                      : "Ждём ответа заведения"
                    : "Подтвердить смену"}
            </span>
          </Button>
          )}
          {/* Одна дверь вместо ряда кнопок. Уточнить часы, перенести и
              отменить нужны редко — но когда нужны, их ищут именно тут.
              Пять кнопок в ряд превращали чат в панель управления. */}
          {canAct && (
            <button
              onClick={() => setTroubleOpen(true)}
              className="text-btn"
              style={{ marginTop: 8, width: "100%" }}
            >
              Изменить смену
            </button>
          )}

          {/* Работнику: заведение предложило другой день — надо ответить.
              Это не пряталось бы в меню: тут ждут ответа именно от него. */}
          {role === "seeker" && srvMatch?.rescheduleDate && (canAcceptMove || canDeclineMove) && (
            <div
              className="card"
              style={{ marginTop: 8, borderColor: "var(--gold)" }}
            >
              <div style={{ fontWeight: 700, marginBottom: 4 }}>
                Заведение предлагает перенос
              </div>
              <p className="muted" style={{ margin: "0 0 10px", fontSize: "var(--text-sm)" }}>
                {shiftDayLabel(srvMatch.rescheduleDate)}
                {srvMatch.rescheduleStart != null &&
                  ` · ${fmtTime(srvMatch.rescheduleStart)}–${fmtTime(srvMatch.rescheduleEnd ?? 0)}`}
              </p>
              <div className="row" style={{ gap: 8 }}>
                {canAcceptMove && (
                  <Button disabled={actionRunner.isPending(matchId, "accept_reschedule")} onClick={() => answerMove(true)}>{actionRunner.isPending(matchId, "accept_reschedule") ? "Сохраняем…" : "Подходит"}</Button>
                )}
                {canDeclineMove && (
                  <Button
                    variant="ghost"
                    disabled={actionRunner.isPending(matchId, "decline_reschedule")}
                    onClick={() => answerMove(false)}
                  >
                    {actionRunner.isPending(matchId, "decline_reschedule") ? "Отправляем…" : "Не смогу"}
                  </Button>
                )}
              </div>
            </div>
          )}

        </div>
        <MessageComposer
          text={text}
          setText={draft.setText}
          onSubmit={sendComposer}
          disabled={accessLost}
        />
      </div>

      {troubleOpen && (
        <Sheet title="Изменить смену" onClose={() => setTroubleOpen(false)}>
            {/* Совет про «предупредить заранее» имеет смысл, только пока
                смену ещё можно перенести или отменить. После её окончания в
                шторке остаётся одна кнопка — уточнить часы, — и предупреждать
                уже не о чем. */}
            {(canMove || canCancel) && (
              <p className="muted" style={{ marginBottom: 12 }}>
                Планы меняются — это нормально. Главное предупредить заранее,
                а не в последний момент.
              </p>
            )}
            <div className="stack">
              {canSetHours && (
                <Button
                  variant="secondary"
                  block
                  onClick={() => {
                    setTroubleOpen(false);
                    if (srvMatch) setHoursValue(numRu(shiftLengthHours(srvMatch)));
                    setHoursOpen(true);
                  }}
                >
                  Смена вышла короче или длиннее
                </Button>
              )}
              {canMove && (
                <Button
                  variant="secondary"
                  block
                  onClick={() => {
                    setTroubleOpen(false);
                    if (srvMatch?.shiftStart != null) {
                      setMoveStart(fmtTime(srvMatch.shiftStart));
                    }
                    if (srvMatch?.shiftEnd != null) {
                      setMoveEnd(fmtTime(srvMatch.shiftEnd));
                    }
                    setMoveOpen(true);
                  }}
                >
                  Перенести на другой день
                </Button>
              )}
              {canCancel && (
                <Button
                  variant="danger"
                  block
                  onClick={() => {
                    setTroubleOpen(false);
                    setCancelOpen(true);
                  }}
                >
                  {role === "employer" ? "Отменить смену" : "Не смогу выйти"}
                </Button>
              )}
              <Button variant="ghost" block onClick={() => setTroubleOpen(false)}>
                Закрыть
              </Button>
            </div>
        </Sheet>
      )}

      {hoursOpen && (
        <Sheet title="Сколько часов вышло" onClose={() => setHoursOpen(false)}>
            <p className="muted" style={{ marginBottom: 12 }}>
              Смена вышла короче или длиннее, чем договаривались, — оплата и комиссия
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
              aria-label="Комментарий к длительности смены"
              placeholder="Отпустили раньше"
              value={hoursNote}
              onChange={(e) => setHoursNote(e.target.value)}
            />
            <div style={{ display: "grid", gap: 10, marginTop: 14 }}>
              <Button block disabled={actionRunner.isPending(matchId, "set_hours")} onClick={saveHours}>{actionRunner.isPending(matchId, "set_hours") ? "Сохраняем…" : "Сохранить часы"}</Button>
              <Button variant="ghost" block onClick={() => setHoursOpen(false)}>
                Отмена
              </Button>
            </div>
        </Sheet>
      )}

      {moveOpen && (
        <Sheet title="Перенести смену" onClose={() => setMoveOpen(false)}>
            <p className="muted" style={{ marginBottom: 12 }}>
              Человек согласился на этот день. Перенос — просьба: в новое
              время он может не выйти.
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
              <Button block disabled={!moveDate || actionRunner.isPending(matchId, "propose_reschedule")} onClick={proposeMove}>
                {actionRunner.isPending(matchId, "propose_reschedule") ? "Отправляем…" : "Предложить перенос"}
              </Button>
              <Button variant="ghost" block onClick={() => setMoveOpen(false)}>
                Отмена
              </Button>
            </div>
        </Sheet>
      )}

      {cancelOpen && (
        <Sheet title="Отменить смену?" onClose={() => setCancelOpen(false)}>
            <p className="muted" style={{ marginBottom: 12 }}>
              {role === "employer" ? "Работник узнает сразу." : "Заведение узнает сразу."}{" "}
              Отменить заранее — не страшно, а за пару часов до начала ударит
              по надёжности профиля.
            </p>
            <div className="form-label">Причина — по желанию</div>
            <input
              className="input"
              aria-label="Причина отмены смены"
              placeholder="например, заболел администратор"
              maxLength={200}
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
            />
            <div style={{ display: "grid", gap: 10, marginTop: 14 }}>
              <Button variant="danger" block disabled={actionRunner.isPending(matchId, "cancel")} onClick={doCancel}>
                {actionRunner.isPending(matchId, "cancel") ? "Отменяем…" : "Отменить смену"}
              </Button>
              <Button variant="ghost" block onClick={() => setCancelOpen(false)}>
                Назад
              </Button>
            </div>
        </Sheet>
      )}

      {conflict && (
        <Sheet title="Смены пересекаются" onClose={() => setConflict(null)}>
            <p className="muted" style={{ marginBottom: 16 }}>{conflict}</p>
            <div className="stack">
              <Button
                block
                disabled={actionRunner.isPending(matchId, "confirm")}
                onClick={() => {
                  setConflict(null);
                  void doConfirm(true);
                }}
              >
                {actionRunner.isPending(matchId, "confirm") ? "Подтверждаем…" : "Всё равно беру"}
              </Button>
              {/* Не «Отменить»: рядом стоит «Всё равно беру», и человек читал
                  это как «отменить смену» — ценой была потерянная подработка. */}
              <Button variant="ghost" block onClick={() => setConflict(null)}>
                Не сейчас
              </Button>
            </div>
        </Sheet>
      )}

      {moreOpen && (
        <Sheet title="Что сделать" onClose={() => setMoreOpen(false)}>
          <div className="stack">
            <Button
              variant="secondary"
              icon={<IconWarning size={16} />}
              onClick={() => {
                setMoreOpen(false);
                setReportOpen(true);
              }}
            >
              Пожаловаться
            </Button>
          </div>
        </Sheet>
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
