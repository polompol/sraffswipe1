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

/**
 * Текст переписки чувствителен: не кладём его ни в localStorage, ни в
 * sessionStorage. Эти Map живут только пока живёт текущий JS-контекст Mini App.
 * После перезапуска источником истины снова становится серверная история.
 */
const drafts = new Map<string, string>();
const outboxes = new Map<string, ChatOutboxItem[]>();

function ownerScope(): string {
  try {
    return localStorage.getItem(LS.uid) || "anon";
  } catch {
    // Если browser storage недоступен, сам чат всё равно работает в памяти.
    return "anon";
  }
}

function scopeKey(matchId: string): string {
  return `${ownerScope()}:${matchId}`;
}

export function readChatDraft(matchId: string): string {
  return drafts.get(scopeKey(matchId)) ?? "";
}

export function writeChatDraft(matchId: string, text: string): void {
  const key = scopeKey(matchId);
  if (!text) drafts.delete(key);
  else drafts.set(key, text);
}

export function clearChatDraft(matchId: string): void {
  drafts.delete(scopeKey(matchId));
}

function readRawOutbox(matchId: string): ChatOutboxItem[] {
  const key = scopeKey(matchId);
  const cutoff = Date.now() - MAX_AGE_MS;
  const next = (outboxes.get(key) ?? [])
    .filter((row) => {
      const ts = Date.parse(row.createdAt);
      return Number.isFinite(ts) && ts >= cutoff;
    })
    .slice(-MAX_OUTBOX);
  if (next.length === 0) outboxes.delete(key);
  else outboxes.set(key, next);
  return next;
}

function writeOutbox(matchId: string, rows: ChatOutboxItem[]): ChatOutboxItem[] {
  const key = scopeKey(matchId);
  const next = rows.slice(-MAX_OUTBOX);
  if (next.length === 0) outboxes.delete(key);
  else outboxes.set(key, next);
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
 * Серверная история подтверждает receipt по client_message_id. Неизвестное
 * `sending` не отправляем автоматически: ответ мог потеряться после успешной
 * записи на сервере. В текущей сессии показываем ручной «Повторить» с тем же
 * idempotency key; после полного перезапуска текст намеренно не сохраняется.
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

/** Очистить чувствительный session-memory, например при выходе из аккаунта. */
export function clearChatRecoveryMemory(): void {
  drafts.clear();
  outboxes.clear();
}
