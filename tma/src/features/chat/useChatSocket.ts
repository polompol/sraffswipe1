/**
 * Живой чат по WebSocket — с переподключением.
 *
 * Соединение рвётся постоянно и без всяких поломок: метро, лифт, переход с
 * вайфая на мобильный, свёрнутое приложение. Раньше после обрыва чат молча
 * замолкал навсегда — человек писал в пустоту и видел ответы, только если
 * закрывал и открывал экран заново. Теперь соединение поднимается само, а за
 * время обрыва история подтягивается обычным запросом, чтобы ничего не
 * потерялось.
 */
import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getToken, useBackend, wsBaseURL } from "@/api/client";
import type { Message } from "@/types/domain";

interface Handlers {
  /** Пришло сообщение (уже в виде модели приложения). */
  onMessage: (msg: Message) => void;
  /** Пришло системное сообщение — статус смены изменился. */
  onSystem: () => void;
  /** Есть ли сейчас живое соединение (для значка «онлайн»). */
  onLive: (live: boolean) => void;
}

export function useChatSocket(matchId: string, handlers: Handlers): void {
  const qc = useQueryClient();
  // Обработчики пересоздаются на каждый рендер, а переподключаться надо
  // только при смене смены. Держим их в ссылке (именно useRef: обычный объект
  // создавался бы заново каждый рендер, а эффект продолжал бы держать самый
  // первый — и звал бы обработчики из первого рендера).
  const ref = useRef(handlers);
  ref.current = handlers;

  useEffect(() => {
    if (!useBackend || !matchId) return;
    let closed = false;
    let attempt = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let ws: WebSocket | null = null;

    const onFrame = (ev: MessageEvent) => {
      try {
        const raw = JSON.parse(ev.data);
        ref.current.onMessage({
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
        if (raw.is_system) ref.current.onSystem();
      } catch {
        /* битый кадр пропускаем */
      }
    };

    const connect = () => {
      if (closed) return;
      const token = getToken();
      ws = new WebSocket(`${wsBaseURL}/ws/chat/${matchId}?token=${token ?? ""}`);
      ws.onopen = () => {
        // Соединение восстановилось — дотягиваем то, что пришло, пока молчали.
        if (attempt > 0) qc.invalidateQueries({ queryKey: ["messages", matchId] });
        attempt = 0;
        ref.current.onLive(true);
      };
      const retry = () => {
        ref.current.onLive(false);
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

    connect();
    return () => {
      closed = true;
      if (timer) clearTimeout(timer);
      if (ws) {
        ws.onclose = null; // иначе закрытие экрана запустит переподключение
        ws.close();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchId]);
}
