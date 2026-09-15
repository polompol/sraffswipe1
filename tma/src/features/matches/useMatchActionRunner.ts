import { useCallback, useRef, useState } from "react";

import type { MatchAction } from "@/types/domain";
import { createMatchActionLock } from "./matchActions";

function actionKey(matchId: string, action: MatchAction): string {
  return `${matchId}:${action}`;
}

/**
 * React-facing lifecycle mutation runner.
 *
 * The ref-backed lock rejects a second event synchronously, before React has a
 * chance to render the disabled button. State mirrors only the accepted
 * mutation so controls can show an honest pending state and recover after
 * success or failure.
 */
export function useMatchActionRunner() {
  const lockRef = useRef(createMatchActionLock());
  const [pendingKeys, setPendingKeys] = useState<Set<string>>(() => new Set());

  const isPending = useCallback(
    (matchId: string, action: MatchAction) =>
      pendingKeys.has(actionKey(matchId, action)),
    [pendingKeys],
  );

  const run = useCallback(
    async (
      matchId: string,
      action: MatchAction,
      work: () => Promise<unknown>,
    ): Promise<boolean> =>
      lockRef.current.run(matchId, action, async () => {
        const key = actionKey(matchId, action);
        setPendingKeys((current) => {
          const next = new Set(current);
          next.add(key);
          return next;
        });
        try {
          await work();
        } finally {
          setPendingKeys((current) => {
            const next = new Set(current);
            next.delete(key);
            return next;
          });
        }
      }),
    [],
  );

  return { run, isPending };
}
