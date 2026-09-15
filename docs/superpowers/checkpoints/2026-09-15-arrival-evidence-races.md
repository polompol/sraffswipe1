# Arrival evidence race checkpoint

Branch: `codex/staffswipe-production-readiness`

This checkpoint triggers repository gates on the verified lifecycle commit that serializes arrival evidence mutations.

Covered invariants:
- `checkin`, `attendance`, and `not-held` serialize on the same `Match` row;
- a correct venue code cannot be silently erased by a concurrent no-show/not-held mutation;
- an explicit no-show/not-held committed first may be contradicted by a correct code only by reopening the match into an operator dispute, never by automatic payment or settlement;
- arbitrary terminal matches are not reopened by the recovery path;
- contradictory evidence cannot persist as both `seeker_checked_in=true` and `no_show=true` without dispute resolution.

Status at creation: implementation committed; full exact-head repository gates pending. This is not a production-readiness declaration.
