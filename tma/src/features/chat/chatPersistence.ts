import type { AppRole } from "@/types/domain";

const CHAT_STORAGE_PREFIX = "ss_chat_v1";

/** Chat persistence is isolated by both account id and active role. */
export function chatStorageKey(userId: string, role: AppRole): string {
  return `${CHAT_STORAGE_PREFIX}:${role}:${userId}`;
}

/** Remove only the selected account/role chat state. */
export function clearChatAccount(userId: string, role: AppRole): void {
  try {
    localStorage.removeItem(chatStorageKey(userId, role));
  } catch {
    // Restricted Telegram/private storage must never make logout fail.
  }
}
