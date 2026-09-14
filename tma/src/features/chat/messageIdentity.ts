import type { Message } from "@/types/domain";

/**
 * Merge server truth into confirmed chat history without duplicating a logical
 * message. Server id is authoritative; before it is known, sender + client
 * receipt identifies the same outbound message across retries/echoes.
 */
export function mergeConfirmedMessage(
  list: Message[],
  incoming: Message,
): Message[] {
  const byServerId = list.findIndex((m) => m.id === incoming.id);
  if (byServerId >= 0) {
    const next = [...list];
    next[byServerId] = incoming;
    return next;
  }

  if (incoming.clientMessageId) {
    const byReceipt = list.findIndex(
      (m) =>
        m.senderId === incoming.senderId &&
        m.clientMessageId === incoming.clientMessageId,
    );
    if (byReceipt >= 0) {
      const next = [...list];
      next[byReceipt] = incoming;
      return next;
    }
  }

  return [...list, incoming];
}
