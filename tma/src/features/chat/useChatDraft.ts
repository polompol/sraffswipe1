import { useCallback, useEffect, useRef, useState } from "react";
import type { AppRole } from "@/types/domain";
import { loadDraft, saveDraft } from "./chatPersistence";

const DRAFT_DEBOUNCE_MS = 200;
const MAX_DRAFT_LENGTH = 2000;

interface UseChatDraftArgs {
  userId: string;
  role: AppRole;
  matchId: string;
}

interface DraftIdentity extends UseChatDraftArgs {}

function sameIdentity(a: DraftIdentity, b: DraftIdentity): boolean {
  return a.userId === b.userId && a.role === b.role && a.matchId === b.matchId;
}

/**
 * Keeps one durable composer draft per account/role/match.
 *
 * The latest value is held in refs so unmount/match switches can synchronously
 * flush it even when React state or the debounce timer has not committed yet.
 */
export function useChatDraft({ userId, role, matchId }: UseChatDraftArgs) {
  const initialIdentity: DraftIdentity = { userId, role, matchId };
  const [text, setTextState] = useState(() => loadDraft(userId, role, matchId));
  const textRef = useRef(text);
  const identityRef = useRef<DraftIdentity>(initialIdentity);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const persistCurrent = useCallback(() => {
    const identity = identityRef.current;
    saveDraft(identity.userId, identity.role, identity.matchId, textRef.current);
  }, []);

  const schedulePersist = useCallback(() => {
    cancelTimer();
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      persistCurrent();
    }, DRAFT_DEBOUNCE_MS);
  }, [cancelTimer, persistCurrent]);

  const setText = useCallback((next: string) => {
    const bounded = next.slice(0, MAX_DRAFT_LENGTH);
    textRef.current = bounded;
    setTextState(bounded);
    schedulePersist();
  }, [schedulePersist]);

  const snapshotForSend = useCallback(() => textRef.current, []);

  const clearIfUnchanged = useCallback((submitted: string) => {
    if (textRef.current !== submitted) return false;
    cancelTimer();
    textRef.current = "";
    setTextState("");
    persistCurrent();
    return true;
  }, [cancelTimer, persistCurrent]);

  // A single hook instance may be reused while navigation changes match id.
  // Flush the previous identity before loading the next one so drafts can never
  // bleed between chats or accounts.
  useEffect(() => {
    const nextIdentity: DraftIdentity = { userId, role, matchId };
    if (sameIdentity(identityRef.current, nextIdentity)) return;

    cancelTimer();
    persistCurrent();
    identityRef.current = nextIdentity;
    const nextText = loadDraft(userId, role, matchId);
    textRef.current = nextText;
    setTextState(nextText);
  }, [cancelTimer, matchId, persistCurrent, role, userId]);

  // Flush synchronously on page/app teardown; Telegram WebViews can disappear
  // before a debounce callback gets another event-loop turn.
  useEffect(() => () => {
    cancelTimer();
    persistCurrent();
  }, [cancelTimer, persistCurrent]);

  return {
    text,
    setText,
    snapshotForSend,
    clearIfUnchanged,
  };
}
