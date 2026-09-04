/**
 * Переписка смены: история, догрузка старого и добавление нового сообщения.
 *
 * Сервер отдаёт последние 100 сообщений — у смены с долгой перепиской
 * остальное лежит выше и подтягивается по кнопке. Добавление идёт через один
 * и тот же путь и для отправленного нами, и для пришедшего по сокету: там
 * дедупликация по id, иначе собственное сообщение задваивается его же эхом.
 */
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchMessages, MESSAGES_PAGE } from "@/api/endpoints";
import type { Message } from "@/types/domain";
import { toast } from "@/components/Toast";

export function useChatHistory(matchId: string) {
  const qc = useQueryClient();
  const [olderLoading, setOlderLoading] = useState(false);
  const [noMoreOlder, setNoMoreOlder] = useState(false);

  const { data: messages, isLoading, isError, refetch } = useQuery({
    queryKey: ["messages", matchId],
    queryFn: () => fetchMessages(matchId),
  });

  const hasOlder = !noMoreOlder && !!messages && messages.length >= MESSAGES_PAGE;

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

  /** Добавить сообщение в кэш с дедупликацией по id (эхо от сокета не задвоит). */
  function appendMessage(msg: Message) {
    qc.setQueryData<Message[]>(["messages", matchId], (old) => {
      const list = old ?? [];
      if (list.some((m) => m.id === msg.id)) return list;
      return [...list, msg];
    });
  }

  return {
    messages,
    isLoading,
    isError,
    refetch,
    hasOlder,
    olderLoading,
    loadOlder,
    appendMessage,
  };
}
