---
name: staffswipe-matchmaking
description: Marketplace ranking, recommendation, retrieval, relevance, cold-start, diversity, exploration, availability, eligibility, and matching-quality review for StaffSwipe1. Use for worker/shift feeds, sorting, recommendation scores, candidate ranking, saved searches, urgent matching, or any logic deciding who sees whom.
---

# StaffSwipe1 matchmaking

The goal is not maximum swipe volume. The goal is a high probability of a real, suitable, completed shift for both sides.

Design recommendations as a staged system:

`eligibility -> candidate retrieval -> hard filters -> relevance score -> trust/safety adjustments -> diversity/exploration -> final ranking`

Keep hard constraints separate from soft ranking preferences.

## Hard eligibility

A candidate must not be ranked at all when a hard requirement fails. Examples may include:

- shift is not active/publishable;
- worker/venue account is suspended or blocked from the counterparty;
- mutually incompatible role requirements;
- unavailable date/time where availability is authoritative;
- legal/age constraints;
- required verification/medical-book condition when the product treats it as mandatory;
- already completed/cancelled/expired shift;
- duplicate already-decided item when the feed semantics exclude it;
- privacy/safety restrictions.

Do not encode hard eligibility as a tiny score penalty.

## Ranking features

Prefer interpretable features such as:

- role fit;
- schedule/availability fit;
- geographic distance or travel feasibility;
- pay fit relative to user preferences;
- experience/skills fit;
- venue/worker reliability indicators;
- prior successful collaboration;
- freshness and urgency;
- response likelihood;
- saved preferences/filters;
- historical completion probability;
- marketplace liquidity need.

Avoid using protected/sensitive attributes unless explicitly justified by law/product policy. Do not infer sensitive traits from names, photos, location, or behavior.

## Suggested scoring architecture

Use a documented weighted score or learned model only after hard eligibility. Example conceptual decomposition:

`score = fit + availability + distance + pay + reliability + repeat_affinity + freshness + exploration - risk_penalties`

Rules:

- normalize features to comparable ranges;
- cap individual feature influence;
- avoid a single popularity metric dominating the feed;
- keep risk/safety penalties server-side;
- log score components for offline evaluation/operator debugging, not client exposure;
- version ranking logic so analytics can compare releases.

Do not hard-code example weights from this skill; choose and validate them against actual product data.

## Worker feed

For workers, prioritize:

- relevant role;
- reachable location;
- acceptable pay;
- compatible date/time;
- venue trust/reliability;
- clear conditions;
- realistic likelihood that the venue still needs someone.

Urgent shifts may receive a freshness/urgency boost, but urgency must never override safety, eligibility, or gross mismatch.

## Venue candidate feed

For venues, prioritize:

- required role/skills;
- actual availability;
- travel feasibility;
- reliability/completed-shift history;
- recent responsiveness;
- prior successful collaboration;
- profile completeness/verification where meaningful.

Do not simply rank by global rating: new workers need a fair cold-start path.

## Cold start

For new workers or venues:

- rely on explicit profile/preferences, location, schedule, role, pay, and verification signals;
- provide controlled exploration rather than burying zero-history accounts;
- avoid treating lack of history as negative history;
- use profile-completion prompts rather than guessing missing preferences.

## Exploration and diversity

A deterministic top-N list can create rich-get-richer effects. Consider controlled exploration:

- reserve a small portion of impressions for high-eligibility under-exposed candidates;
- diversify near-duplicate venues/shifts when many similar results exist;
- avoid showing the same repeatedly passed item without a meaningful state change;
- cap excessive exposure concentration where it harms marketplace liquidity.

Exploration must not bypass hard eligibility or trust restrictions.

## Feedback signals

Treat feedback with different confidence levels:

Strong positive:

- mutual match;
- confirmed shift;
- completed shift;
- repeat booking;

Medium positive:

- like/swipe right;
- chat initiated;
- saved/favorite.

Negative:

- explicit pass;
- block/report;
- cancellation/no-show when adjudicated;
- repeated ignored recommendations.

Do not treat absence of a click as a strong negative without considering exposure quality and user activity.

## Saved searches and alerts

Saved-search notifications should use stricter quality thresholds than passive feed ranking because notifications are interruptive.

- alert only for new/meaningfully changed candidates;
- deduplicate;
- honor exact saved filters;
- suppress when the user already acted on the item;
- rate-limit notifications;
- prioritize time-sensitive relevance.

## Evaluation

Track ranking by version and segment. Useful metrics include:

- impression -> like;
- like -> match;
- match -> first message;
- match -> confirmed shift;
- confirmed -> completed shift;
- time to fill;
- no-show/dispute rate;
- exposure concentration;
- cold-start success;
- repeat collaboration.

The most important offline/online success metric should be downstream completed shifts, not CTR alone.

## Fairness and abuse resistance

- Do not expose exact score formulas or trust thresholds in the client.
- Prevent clients from requesting arbitrary hidden candidates by id.
- Limit scraping/enumeration via server-side pagination, authorization, rate limits, and eligibility checks.
- Review ranking manipulation through spam swipes, fake reviews, referral rings, or coordinated accounts with `staffswipe-trust-safety`.
- Ensure sponsored/paid placement is never silently mixed into organic ranking if monetization strategy changes.

## Implementation discipline

When changing ranking:

1. Document feature inputs and data freshness.
2. Define hard filters separately.
3. Version the ranking algorithm.
4. Add deterministic tests for edge cases.
5. Add observability for empty feeds and score anomalies.
6. Validate SQL/query performance and indexes.
7. Roll out with measurable guardrails when practical.

## Verification

Test hard eligibility, blocking, expired/cancelled shifts, cold start, repeated passes, saved-search dedupe, urgent ranking, and prior-collaboration boost behavior. Apply `staffswipe-performance`, `staffswipe-trust-safety`, `staffswipe-growth`, and `staffswipe-privacy` where relevant.
