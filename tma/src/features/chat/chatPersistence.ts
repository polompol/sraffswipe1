import type { Message } from "@/types/domain";
import { LS } from "@/lib/storage";

export type ChatDeliveryStatus = "sending" | "failed";

export interface ChatOutboxItem {
  clientMessageId: string;
  text: string;
  status: ChatDeliveryStatus;
  createdAt: string;
}

const MAX_OUTBOX = 20;
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function ownerScope(): string {
  try {
    return localStorage.getItem(LS.uid) || "anon";
  } catch {
    return "anon";
  }
}

function draftKey(matchId: string): string {
  return `${LS.chatDraft}:${ownerScope()}:${matchId}`;
}

function outboxKey(matchId: string): string {
  return `${LS.chatOutbox}:${ownerScope()}:${matchId}`;
}

function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Приватный режим/переполненное хранилище не должны ломать сам чат.
  }
}

function safeRemove(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // Хранилище может быть недоступно — тогда просто живём без persistence.
  }
}

export function readChatDraft(matchId: string): string {
  return safeGet(draftKey(matchId)) ?? "";
}

export function writeChatDraft(matchId: string, text: string): void {
  if (!text) {
    clearChatDraft(matchId);
    return;
  }
  safeSet(draftKey(matchId), text);
}

export function clearChatDraft(matchId: string): void {
  safeRemove(draftKey(matchId));
}

function validOutboxItem(value: unknown): value is ChatOutboxItem {
  if (!value || typeof value !== "object") return false;
  const row = value as Partial<ChatOutboxItem>;
  return (
    typeof row.clientMessageId === "string"
    && typeof row.text === "string"
    && (row.status === "sending" || row.status === "failed")
    && typeof row.createdAt === "string"
  );
}

function readRawOutbox(matchId: string): ChatOutboxItem[] {
  const raw = safeGet(outboxKey(matchId));
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const cutoff = Date.now() - MAX_AGE_MS;
    return parsed
      .filter(validOutboxItem)
      .filter((row) => {
        const ts = Date.parse(row.createdAt);
        return Number.isFinite(ts) && ts >= cutoff;
      })
      .slice(-MAX_OUTBOX);
  } catch {
    return [];
  }
}

function writeOutbox(matchId: string, rows: ChatOutboxItem[]): ChatOutboxItem[] {
  const next = rows.slice(-MAX_OUTBOX);
  if (next.length === 0) safeRemove(outboxKey(matchId));
  else safeSet(outboxKey(matchId), JSON.stringify(next));
  return next;
}

export function queueChatMessage(
  matchId: string,
  text: string,
  clientMessageId: string,
): ChatOutboxItem {
  const item: ChatOutboxItem = {
    clientMessageId,
    text,
    status: "sending",
    createdAt: new Date().toISOString(),
  };
  const current = readRawOutbox(matchId).filter(
    (row) => row.clientMessageId !== clientMessageId,
  );
  writeOutbox(matchId, [...current, item]);
  return item;
}

function updateStatus(
  matchId: string,
  clientMessageId: string,
  status: ChatDeliveryStatus,
): ChatOutboxItem | null {
  let changed: ChatOutboxItem | null = null;
  const next = readRawOutbox(matchId).map((row) => {
    if (row.clientMessageId !== clientMessageId) return row;
    changed = { ...row, status };
    return changed;
  });
  writeOutbox(matchId, next);
  return changed;
}

export function markChatMessageFailed(
  matchId: string,
  clientMessageId: string,
): ChatOutboxItem | null {
  return updateStatus(matchId, clientMessageId, "failed");
}

export function markChatMessageSending(
  matchId: string,
  clientMessageId: string,
): ChatOutboxItem | null {
  return updateStatus(matchId, clientMessageId, "sending");
}

export function removeChatOutboxItem(matchId: string, clientMessageId: string): void {
  writeOutbox(
    matchId,
    readRawOutbox(matchId).filter((row) => row.clientMessageId !== clientMessageId),
  );
}

/**
 * После reload неизвестное `sending` не отправляем автоматически: сервер мог
 * уже принять запрос, а ответ потерялся. Сначала история подтверждает receipt;
 * если его там нет, показываем ручной «Повторить» с ТЕМ ЖЕ idempotency key.
 */
export function restoreChatOutbox(
  matchId: string,
  serverMessages: readonly Message[] = [],
): ChatOutboxItem[] {
  const confirmed = new Set(
    serverMessages
      .map((message) => message.clientMessageId)
      .filter((id): id is string => Boolean(id)),
  );
  const next = readRawOutbox(matchId)
    .filter((row) => !confirmed.has(row.clientMessageId))
    .map((row) => ({ ...row, status: "failed" as const }));
  return writeOutbox(matchId, next);
}
