# Lifecycle hardening checkpoint — dispute/cancel

Branch: `codex/staffswipe-production-readiness`

This checkpoint exists to trigger repository gates on the post-verification commit that serializes `dispute` and `cancel` mutations.

Covered invariants:
- one `Match` row is the transaction boundary for concurrent `dispute` and `cancel` requests;
- duplicate concurrent `dispute` requests must not create duplicate reports/messages/notifications;
- concurrent `cancel` requests must have one winner and a stale retry must observe the committed terminal state;
- participant authorization is bound to both role and participant id.

Status at creation: implementation committed; full repository gates pending on the exact head. Do not treat this checkpoint as a production-readiness declaration.
