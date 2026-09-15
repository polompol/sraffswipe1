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
