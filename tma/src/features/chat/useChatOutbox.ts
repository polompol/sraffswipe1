import { useCallback, useEffect, useRef, useState } from "react";
import { sendMessage } from "@/api/endpoints";
import type { AppRole, Message } from "@/types/domain";
import {
  loadOutbox,
  removeOutbox,
  upsertOutbox,
  type OutboxEntry,
} from "./chatPersistence";

const RATE_LIMIT_COOLDOWN_MS = 30_000;

type SendFn = (
  matchId: string,
  input: { text: string; clientMessageId: string },
) => Promise<Message>;

interface UseChatOutboxArgs {
  matchId: string;
  userId: string;
  role: AppRole;
  confirmedMessages: Message[];
  live: boolean;
  appendConfirmed: (message: Message) => void;
}

interface OutboxDeps {
  send?: SendFn;
  makeId?: () => string;
  now?: () => number;
}

function fallbackUuidV4(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((value) => value.toString(16).padStart(2, "0"));
  return [
    hex.slice(0, 4).join(""),
    hex.slice(4, 6).join(""),
    hex.slice(6, 8).join(""),
    hex.slice(8, 10).join(""),
    hex.slice(10, 16).join(""),
  ].join("-");
}

/** Receipt identity is security/reliability data: never use Math.random(). */
export function newClientMessageId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return fallbackUuidV4();
}

function statusOf(error: unknown): number | undefined {
  return (error as { response?: { status?: number } })?.response?.status;
}

function classifyFailure(
  error: unknown,
  now: number,
): Pick<OutboxEntry, "status" | "lastError" | "retryAfter"> {
  const status = statusOf(error);
  if (status === 401 || status === 403) {
    return { status: "blocked", lastError: "forbidden", retryAfter: undefined };
  }
  if (status === 409) {
    return { status: "blocked", lastError: "integrity", retryAfter: undefined };
  }
  if (status === 429) {
    return {
      status: "failed",
      lastError: "rate_limit",
      retryAfter: now + RATE_LIMIT_COOLDOWN_MS,
    };
  }
  if (status === undefined) {
    return { status: "failed", lastError: "network", retryAfter: undefined };
  }
  return { status: "failed", lastError: "server", retryAfter: undefined };
}

function isConfirmed(
  entry: OutboxEntry,
  messages: Message[],
  userId: string,
): boolean {
  return messages.some(
    (message) =>
      message.senderId === userId &&
      message.clientMessageId === entry.clientMessageId,
  );
}

function canRetry(entry: OutboxEntry, now: number): boolean {
  if (entry.status === "blocked") return false;
  if (entry.retryAfter !== undefined && entry.retryAfter > now) return false;
  return true;
}

export function useChatOutbox(
  args: UseChatOutboxArgs,
  deps: OutboxDeps = {},
) {
  const { matchId, userId, role, confirmedMessages, live, appendConfirmed } = args;
  const send = deps.send ?? (sendMessage as SendFn);
  const makeId = deps.makeId ?? newClientMessageId;
  const now = deps.now ?? Date.now;
  const [entries, setEntries] = useState<OutboxEntry[]>(() =>
    loadOutbox(userId, role, matchId),
  );
  const entriesRef = useRef(entries);
  const inFlight = useRef(new Set<string>());
  const messagesRef = useRef(confirmedMessages);
  messagesRef.current = confirmedMessages;

  const replaceEntries = useCallback((next: OutboxEntry[]) => {
    entriesRef.current = next;
    setEntries(next);
  }, []);

  const reload = useCallback(() => {
    replaceEntries(loadOutbox(userId, role, matchId));
  }, [matchId, replaceEntries, role, userId]);

  const reconcileConfirmed = useCallback(() => {
    let changed = false;
    for (const entry of loadOutbox(userId, role, matchId)) {
      if (isConfirmed(entry, messagesRef.current, userId)) {
        removeOutbox(userId, role, entry.clientMessageId);
        changed = true;
      }
    }
    if (changed) reload();
  }, [matchId, reload, role, userId]);

  const deliver = useCallback(async (source: OutboxEntry): Promise<void> => {
    if (inFlight.current.has(source.clientMessageId)) return;
    if (isConfirmed(source, messagesRef.current, userId)) {
      removeOutbox(userId, role, source.clientMessageId);
      reload();
      return;
    }
    if (!canRetry(source, now())) return;

    inFlight.current.add(source.clientMessageId);
    const sending: OutboxEntry = {
      ...source,
      status: "sending",
      attempts: source.attempts + 1,
      lastError: undefined,
      retryAfter: undefined,
    };
    if (!upsertOutbox(userId, role, sending)) {
      inFlight.current.delete(source.clientMessageId);
      reload();
      return;
    }
    reload();

    try {
      const message = await send(matchId, {
        text: source.text,
        clientMessageId: source.clientMessageId,
      });
      appendConfirmed(message);
      removeOutbox(userId, role, source.clientMessageId);
    } catch (error) {
      const failure = classifyFailure(error, now());
      upsertOutbox(userId, role, {
        ...sending,
        ...failure,
      });
    } finally {
      inFlight.current.delete(source.clientMessageId);
      reload();
    }
  }, [appendConfirmed, matchId, now, reload, role, send, userId]);

  const sendText = useCallback(async (rawText: string): Promise<boolean> => {
    const text = rawText.trim();
    if (!text) return false;
    const entry: OutboxEntry = {
      clientMessageId: makeId(),
      matchId,
      text: text.slice(0, 2000),
      createdAt: new Date(now()).toISOString(),
      status: "pending",
      attempts: 0,
    };
    if (!upsertOutbox(userId, role, entry)) return false;
    reload();
    await deliver(entry);
    return true;
  }, [deliver, makeId, matchId, now, reload, role, userId]);

  const retry = useCallback(async (clientMessageId: string): Promise<void> => {
    const entry = loadOutbox(userId, role, matchId).find(
      (row) => row.clientMessageId === clientMessageId,
    );
    if (!entry || entry.status === "blocked") return;
    await deliver(entry);
  }, [deliver, matchId, role, userId]);

  const flush = useCallback(async (): Promise<void> => {
    reconcileConfirmed();
    const snapshot = loadOutbox(userId, role, matchId);
    for (const entry of snapshot) {
      if (isConfirmed(entry, messagesRef.current, userId)) {
        removeOutbox(userId, role, entry.clientMessageId);
        continue;
      }
      if (canRetry(entry, now())) await deliver(entry);
    }
    reload();
  }, [deliver, matchId, now, reconcileConfirmed, reload, role, userId]);

  useEffect(() => {
    reload();
  }, [reload]);

  useEffect(() => {
    reconcileConfirmed();
  }, [confirmedMessages, reconcileConfirmed]);

  useEffect(() => {
    if (live) void flush();
  }, [flush, live]);

  const terminalAccessLost = entries.some(
    (entry) => entry.status === "blocked" && entry.lastError === "forbidden",
  );

  return {
    entries,
    sendText,
    retry,
    reconcileConfirmed,
    flush,
    terminalAccessLost,
  };
}
