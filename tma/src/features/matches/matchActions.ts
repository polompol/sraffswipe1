import type { MatchAction, MatchModel } from "@/types/domain";

/** State-changing controls are fail-closed when the live API omitted its
 * capability list. Status is presentation data, never an authorization hint. */
export function hasMatchAction(match: MatchModel | null | undefined, action: MatchAction): boolean {
  return Array.isArray(match?.allowedActions) && match.allowedActions.includes(action);
}

export function hasAnyMatchAction(
  match: MatchModel | null | undefined,
  actions: readonly MatchAction[],
): boolean {
  return actions.some((action) => hasMatchAction(match, action));
}

function actionKey(matchId: string, action: MatchAction): string {
  return `${matchId}:${action}`;
}

/**
 * Process-local UI guard for lifecycle mutations.
 *
 * A fast double tap can enter the same async handler twice before React has
 * rendered a disabled button. Keep the synchronous lock outside React state so
 * only the first invocation reaches the API. Server idempotency remains the
 * authoritative safety net; this guard prevents duplicate requests and noisy
 * feedback in the client.
 */
export function createMatchActionLock() {
  const pending = new Set<string>();

  return {
    isPending(matchId: string, action: MatchAction): boolean {
      return pending.has(actionKey(matchId, action));
    },

    async run<T>(
      matchId: string,
      action: MatchAction,
      work: () => Promise<T>,
    ): Promise<boolean> {
      const key = actionKey(matchId, action);
      if (pending.has(key)) return false;

      pending.add(key);
      try {
        await work();
        return true;
      } finally {
        pending.delete(key);
      }
    },
  };
}
