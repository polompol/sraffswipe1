import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Message, MatchModel } from "@/types/domain";
import { MESSAGES_PAGE, ShiftConflict, answerReschedule, cancelShift, confirmShift, proposeReschedule, setActualHours, fetchMatches, fetchMessages, sendMessage, track } from "@/api/endpoints";
import { getToken, useBackend, wsBaseURL } from "@/api/client";
import { showBackButton, haptic } from "@/telegram/sdk";
import { coin } from "@/lib/sfx";
import { fmtTime, shiftEnded, shiftStarted, shiftWhen } from "@/lib/format";
import { apiError } from "@/lib/errors";
import { useSession } from "@/store/session";
import { ReportSheet } from "@/components/ReportSheet";
import { Sheet } from "@/components/Sheet";
import { Button } from "@/components/Button";
import { toast } from "@/components/Toast";
import { ErrorBox, SkeletonList } from "@/components/States";
import { EmptyState } from "@/components/EmptyState";
import { IconSend, IconBack, IconWarning, IconCheck, IconChat } from "@/components/Icons";

// Быстрые ответы — частые фразы одним нажатием. У сторон они РАЗНЫЕ: заведению
// предлагались реплики работника («Какой адрес?», «Что взять с собой?»), то
// есть человеку показывали вопросы, ответы на которые он и должен дать.
// Мужского рода тут тоже быть не должно: половина бариста и официантов —
// женщины, и подсказка «Готов выйти» им не подходит.
const QUICK_REPLIES_SEEKER = [
  "Здравствуйте!",
  "Выйду на смену",
  "Во сколько выходить?",
  "Какой адрес?",
  "Что взять с собой?",
];
const QUICK_REPLIES_EMPLOYER = [
  "Здравствуйте!",
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
  const [text, setText] = useState("");
  // Есть ли живое соединение. Нужно, чтобы честно сказать человеку «связь
  // потеряна, восстанавливаем» вместо молчаливого чата, который выглядит
  // рабочим, но ничего не получает.
  const [live, setLive] = useState(true);
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

  const { data: messages, isLoading, isError, refetch } = useQuery({
    queryKey: ["messages", matchId],
    queryFn: () => fetchMessages(matchId),
  });

  // К последнему сообщению — при открытии чата и на каждое новое.
  //
  // Следим именно за ПОСЛЕДНИМ сообщением, а не за всем списком: когда
  // догружается старая переписка, список меняется, а прокручивать вниз нельзя
  // — человек только что нажал «показать более ранние» и смотрит наверх.
  const lastId = messages?.length ? messages[messages.length - 1].id : "";
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

  // Догрузка старой переписки. Сервер отдаёт последние 100 сообщений: у смены
  // с долгой перепиской остальное лежит выше и подтягивается по кнопке.
  const [olderLoading, setOlderLoading] = useState(false);
  const [noMoreOlder, setNoMoreOlder] = useState(false);
  const hasOlder =
    !noMoreOlder && !!messages && messages.length >= MESSAGES_PAGE;

  async function loadOlder() {
    if (!messages?.length || olderLoading) return;
    setOlderLoading(true);
    try {
      const older = await fetchMessages(matchId, messages[0].id);
      if (older.length === 0) {
        setNoMoreOlder(true);
      } else {
        qc.setQueryData<Message[]>(["messages", matchId], (old) => {
          const list = old ?? [];
          const known = new Set(list.map((m) => m.id));
          return [...older.filter((m) => !known.has(m.id)), ...list];
        });
        if (older.length < MESSAGES_PAGE) setNoMoreOlder(true);
      }
    } catch {
      toast("Старые сообщения не загрузились — попробуйте ещё раз", "error");
    } finally {
      setOlderLoading(false);
    }
  }

  const { data: matches } = useQuery({ queryKey: ["matches"], queryFn: fetchMatches });
  const srvMatch = match ?? matches?.find((m) => m.id === matchId) ?? null;
  const iConfirmed = role === "employer"
    ? !!srvMatch?.confirmedByEmployer
    : !!srvMatch?.confirmedBySeeker;
  const bothConfirmed =
    !!srvMatch && srvMatch.confirmedBySeeker && srvMatch.confirmedByEmployer;
  // Смена ещё «живая»: не отменена и не закрыта сама собой.
  const alive =
    !!srvMatch && !["cancelled", "expired", "completed"].includes(srvMatch.status);
  // Смена ещё не началась — по отметкам И ПО ВРЕМЕНИ. Только по отметкам было
  // мало: сервер теперь отказывает в отмене и переносе начавшейся смены (это
  // была универсальная кнопка «не платить»), а приложение об этом не знало и
  // показывало кнопки, которые отвечали ошибкой.
  const notStarted =
    !!srvMatch
    && !srvMatch.seekerCheckedIn
    && !srvMatch.employerCheckedIn
    && !shiftStarted(srvMatch);
  const canCancel = alive && notStarted;
  const canMove = role === "employer" && alive && notStarted;
  // Уточнить часы можно только в первые сутки после смены.
  const canSetHours =
    role === "employer" && alive && !!srvMatch && shiftEnded(srvMatch);
  const canAct = canCancel || canMove || canSetHours;

  // Добавить сообщение в кэш с дедупликацией по id (echo от WS не задвоит).
  function appendMessage(msg: Message) {
    qc.setQueryData<Message[]>(["messages", matchId], (old) => {
      const list = old ?? [];
      if (list.some((m) => m.id === msg.id)) return list;
      return [...list, msg];
    });
  }

  // Живой чат через WebSocket (только при реальном backend).
  //
  // С переподключением. Соединение рвётся постоянно и без всяких поломок:
  // метро, лифт, переключение с вайфая на мобильный, свёрнутое приложение.
  // Раньше после обрыва чат молча замолкал навсегда — человек писал в пустоту
  // и видел ответы только если закрывал и открывал экран заново. Теперь
  // соединение поднимается само, а на время обрыва история подтягивается
  // обычным запросом, чтобы ничего не потерялось.
  useEffect(() => {
    if (!useBackend || !matchId) return;
    let closed = false;
    let attempt = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let ws: WebSocket | null = null;

    const connect = () => {
      if (closed) return;
      const token = getToken();
      ws = new WebSocket(
        `${wsBaseURL}/ws/chat/${matchId}?token=${token ?? ""}`,
      );
      ws.onopen = () => {
        // Соединение восстановилось — дотягиваем то, что пришло, пока молчали.
        if (attempt > 0) qc.invalidateQueries({ queryKey: ["messages", matchId] });
        attempt = 0;
        setLive(true);
      };
      const retry = () => {
        setLive(false);
        if (closed) return;
        // Пауза растёт: 1, 2, 4… до 15 секунд. Так мы не долбим сервер,
        // когда связи нет совсем, но возвращаемся быстро, если она мигнула.
        const delay = Math.min(15000, 1000 * 2 ** attempt);
        attempt += 1;
        timer = setTimeout(connect, delay);
      };
      ws.onclose = retry;
      ws.onerror = () => ws?.close();
      ws.onmessage = onFrame;
    };

    const onFrame = (ev: MessageEvent) => {
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
        // Системные сообщения приходят на смену статуса: вторая сторона
        // подтвердила, отметилась, перенесла. Без обновления кнопка над
        // чатом продолжала говорить «Ждём подтверждения второй стороны»,
        // хотя прямо под ней уже висело «Смена подтверждена».
        if (raw.is_system) {
          // Локальную копию мэтча сбрасываем: иначе она навсегда перекрывает
          // свежие данные сервера (`match ?? matches?.find(...)`).
          setMatchState(null);
          qc.invalidateQueries({ queryKey: ["matches"] });
        }
      } catch {
        /* ignore malformed frame */
      }
    };

    connect();
    return () => {
      closed = true;
      if (timer) clearTimeout(timer);
      if (ws) {
        ws.onclose = null;   // иначе закрытие экрана запустит переподключение
        ws.close();
      }
    };
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
      toast("Часы сохранили — работник уже видит", "success");
      qc.invalidateQueries({ queryKey: ["messages", matchId] });
    } catch (e: any) {
      haptic("error");
      toast(apiError(e, "Часы не сохранились — попробуйте ещё раз"), "error");
    }
  }

  async function proposeMove() {
    try {
      const m = await proposeReschedule(
        matchId, moveDate, toMinutes(moveStart), toMinutes(moveEnd));
      haptic("success");
      setMatchState(m);
      setMoveOpen(false);
      toast("Предложили перенос — ждём ответа", "success");
      qc.invalidateQueries({ queryKey: ["messages", matchId] });
    } catch (e: any) {
      haptic("error");
      toast(apiError(e, "Перенос не предложился — попробуйте ещё раз"), "error");
    }
  }

  async function answerMove(accept: boolean) {
    try {
      const m = await answerReschedule(matchId, accept);
      haptic(accept ? "success" : "warning");
      setMatchState(m);
      toast(accept ? "Смена перенесена ✓" : "Ответили: выйти не сможете", "success");
      qc.invalidateQueries({ queryKey: ["messages", matchId] });
      qc.invalidateQueries({ queryKey: ["matches"] });
    } catch {
      haptic("error");
      toast("Ответ не ушёл — попробуйте ещё раз", "error");
    }
  }

  async function doCancel() {
    try {
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
      <div className="page" style={{ paddingBottom: 0 }}>
        <div className="row" style={{ marginBottom: 12 }}>
          <button className="icon-btn" aria-label="Назад" onClick={() => nav(-1)}>
            <IconBack size={22} />
          </button>
          {/* Когда смена — прямо в шапке. Раньше в чате не было ни даты, ни
              времени: человек договорился и потом искал их в переписке. */}
          <span className="grow">
            <b style={{ display: "block" }}>
              {(role === "employer" ? srvMatch?.seekerName : srvMatch?.companyName)
                || "Чат по смене"}
            </b>
            {srvMatch && shiftWhen(srvMatch) && (
              <span className="muted small">
                {shiftWhen(srvMatch)}
              </span>
            )}
          </span>
          <button
            className="icon-btn"
            style={{ color: "var(--muted)" }}
            aria-label="Пожаловаться"
            onClick={() => setReportOpen(true)}
          >
            <IconWarning size={20} />
          </button>
        </div>

        {!live && useBackend && (
          <div
            className="muted"
            role="status"
            style={{ textAlign: "center", fontSize: "var(--text-xs)", padding: "6px 0" }}
          >
            Связь потеряна — восстанавливаем…
          </div>
        )}
        {isLoading && <SkeletonList rows={4} />}
        {isError && <ErrorBox onRetry={() => refetch()} />}
        {!isLoading && !isError && messages && messages.length === 0 && (
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

        {hasOlder && (
          <button
            onClick={loadOlder}
            disabled={olderLoading}
            style={{
              display: "block",
              margin: "0 auto 10px",
              // 44px — минимальная зона, в которую уверенно попадает палец.
              minHeight: 44,
              padding: "0 14px",
              background: "none",
              border: "none",
              color: "var(--muted)",
              fontSize: "var(--text-sm)",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {olderLoading ? "Загружаем…" : "Показать старые сообщения"}
          </button>
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
          padding: "8px 12px calc(8px + env(safe-area-inset-bottom))",
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
          {(role === "employer" ? QUICK_REPLIES_EMPLOYER : QUICK_REPLIES_SEEKER).map((q) => (
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
            <span className="inline">
              <IconCheck size={17} />
              {/* Без второй галочки в тексте: слева уже стоит иконка, и
                  вместе получалось «✓ Смена подтверждена ✓». */}
              {bothConfirmed
                ? "Смена подтверждена"
                : iConfirmed
                  ? role === "employer"
                    ? "Ждём, когда работник подтвердит"
                    : "Ждём, когда заведение подтвердит"
                  : "Подтвердить смену"}
            </span>
          </Button>
          {/* Одна дверь вместо ряда кнопок. Уточнить часы, перенести и
              отменить нужны редко — но когда нужны, их ищут именно тут.
              Пять кнопок в ряд превращали чат в панель управления. */}
          {canAct && (
            <button
              onClick={() => setTroubleOpen(true)}
              style={{
                marginTop: 8,
                width: "100%",
                minHeight: 44,
                background: "none",
                border: "none",
                color: "var(--muted)",
                fontSize: "var(--text-sm)",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Изменить смену
            </button>
          )}

          {/* Работнику: заведение предложило другой день — надо ответить.
              Это не пряталось бы в меню: тут ждут ответа именно от него. */}
          {role === "seeker" && srvMatch?.rescheduleDate && (
            <div
              className="card"
              style={{ marginTop: 8, borderColor: "var(--gold)" }}
            >
              <div style={{ fontWeight: 700, marginBottom: 4 }}>
                Заведение предлагает перенос
              </div>
              <p className="muted" style={{ margin: "0 0 10px", fontSize: "var(--text-sm)" }}>
                {srvMatch.rescheduleDate}
                {srvMatch.rescheduleStart != null &&
                  ` · ${fmtTime(srvMatch.rescheduleStart)}–${fmtTime(srvMatch.rescheduleEnd ?? 0)}`}
              </p>
              <div className="row" style={{ gap: 8 }}>
                <Button onClick={() => answerMove(true)}>Согласен</Button>
                <Button variant="ghost" onClick={() => answerMove(false)}>
                  Не смогу
                </Button>
              </div>
            </div>
          )}

        </div>
        <div className="row">
          <input
            className="input"
            aria-label="Текст сообщения"
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

      {troubleOpen && (
        <Sheet title="Изменить смену" onClose={() => setTroubleOpen(false)}>
            <p className="muted" style={{ marginBottom: 12 }}>
              Планы меняются — это нормально. Главное предупредить заранее,
              а не в последний момент.
            </p>
            <div className="stack">
              {canSetHours && (
                <Button
                  variant="secondary"
                  block
                  onClick={() => {
                    setTroubleOpen(false);
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
                  {role === "employer" ? "Смена не состоится" : "Не смогу выйти"}
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
              aria-label="Комментарий к длительности смены"
              placeholder="Отпустили раньше"
              value={hoursNote}
              onChange={(e) => setHoursNote(e.target.value)}
            />
            <div style={{ display: "grid", gap: 10, marginTop: 14 }}>
              <Button block onClick={saveHours}>Сохранить часы</Button>
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
              <Button block disabled={!moveDate} onClick={proposeMove}>
                Предложить перенос
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
            <input
              className="input"
              aria-label="Причина отмены смены"
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
        </Sheet>
      )}

      {conflict && (
        <Sheet title="Смены пересекаются" onClose={() => setConflict(null)}>
            <p className="muted" style={{ marginBottom: 16 }}>{conflict}</p>
            <div className="stack">
              <Button
                block
                onClick={() => {
                  setConflict(null);
                  void doConfirm(true);
                }}
              >
                Всё равно беру
              </Button>
              {/* Не «Отменить»: рядом стоит «Всё равно беру», и человек читал
                  это как «отменить смену» — ценой была потерянная подработка. */}
              <Button variant="ghost" block onClick={() => setConflict(null)}>
                Не сейчас
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
