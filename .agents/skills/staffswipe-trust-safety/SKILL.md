---
name: staffswipe-trust-safety
description: Trust, safety, abuse, fraud, moderation, no-show, fake-venue, multi-account, report, reputation, and marketplace integrity review for StaffSwipe1. Use for any feature that can affect user trust, worker or venue safety, account reputation, reporting, blocking, verification, matching eligibility, or enforcement.
---

# StaffSwipe1 trust & safety

StaffSwipe is a two-sided marketplace. Optimize for successful real shifts while preventing abuse without silently punishing legitimate users.

## Core principles

- Never treat one weak signal as proof of fraud.
- Separate detection, review, enforcement, and appeal.
- Prefer reversible friction before irreversible penalties when confidence is low.
- Do not expose internal abuse signals, thresholds, device fingerprints, or investigator notes to normal users.
- Do not use sensitive personal attributes as ranking or enforcement features unless legally required and explicitly approved.
- Keep worker and venue safety symmetric: both sides can report, block, dispute, and appeal.
- Every automated restriction must have a machine-readable reason code and an operator-visible explanation.

## Threat model

Review every relevant change for:

- fake or impersonated venues;
- fake workers and identity relinking abuse;
- multi-accounting to evade bans, bonuses, limits, or ratings;
- referral farming and self-referrals;
- coordinated rating/review manipulation;
- spam swipes, scraping, enumeration, or bulk harvesting;
- harassment, coercion, unsafe chat content, and off-platform scam attempts;
- no-show patterns from workers or venues;
- shift bait-and-switch: changed pay, hours, address, role, or conditions after match;
- charge, refund, commission, or dispute abuse;
- repeated cancellations timed to avoid consequences;
- malicious reports intended to suppress competitors or users;
- compromised Telegram accounts or suspicious relinking.

## Safety state model

Prefer explicit state over scattered booleans. Where product implementation needs it, model:

- `trust_status`: normal, review, restricted, suspended, banned;
- `verification_status`: unverified, pending, verified, rejected, expired;
- `report_status`: open, triaged, actioned, dismissed, appealed, resolved;
- `risk_reason_codes`: structured internal codes;
- `enforcement_expires_at`: nullable for temporary restrictions;
- `appeal_status`: none, submitted, accepted, rejected.

Do not add these fields blindly. Reuse existing structures when equivalent semantics already exist and add Alembic migrations for schema changes.

## Risk scoring rules

If adding a risk score:

1. Make it advisory, not a hidden universal ban switch.
2. Keep components interpretable: account age, completed shifts, cancellation rate, report quality, payment anomalies, velocity, verification, repeated device/network correlations, and operator outcomes.
3. Weight recent behavior more than stale incidents where appropriate.
4. Cap the impact of any single noisy signal.
5. Never expose exact weights or thresholds client-side.
6. Record which signals contributed to a decision so operators can audit it.
7. Test false positives, especially for shared Wi-Fi, shared devices, venue staff sharing infrastructure, and users with unstable networks.

## No-show policy

A no-show is not merely a missed confirmation. Require evidence from the shift lifecycle.

- Distinguish worker no-show, venue no-show/closure, mutual cancellation, disputed attendance, and technical failure.
- Do not mark no-show while an active dispute can explain the absence.
- Repeated verified no-shows may lower trust and introduce temporary booking friction.
- A first isolated incident should generally not create a permanent penalty.
- Provide appeal and operator override paths.
- Keep financial consequences consistent with `staffswipe-financial-integrity`.

## Venue verification

For verified venues:

- verify business identity through trusted server-side data sources already supported by the project;
- bind verification to the venue entity, not only to a user session;
- re-check when legal identity or ownership changes;
- do not expose private INN/phone/document data in public feeds;
- do not store document photos unless a separate approved legal/security design explicitly requires it;
- show users a clear distinction between verified identity and subjective quality/reputation.

## Multi-account and evasion review

Use correlation as evidence, not identity proof.

- Telegram `tg_id` remains the primary account identity key.
- Device, IP, timing, referral graph, payment metadata, venue linkage, and behavior may support risk review.
- Do not block solely because multiple users share an IP or device.
- Detect bonus/referral abuse separately from account compromise.
- Ban-evasion decisions should require multiple independent signals or operator confirmation at high impact.

## Reports, blocking, moderation

Every report flow should include:

- reporter, subject, resource type/id, category, optional text/evidence, timestamps;
- deduplication/velocity controls to limit report spam;
- server-side authorization so users cannot inspect unrelated reports;
- block semantics that immediately hide direct interaction where appropriate;
- operator triage reason codes and action history;
- appeal path for impactful enforcement;
- privacy-safe notifications that do not reveal reporter identity by default.

For chat safety, prefer reporting and blocking with retained evidence needed for dispute handling. Do not silently delete evidence required for financial or safety disputes.

## Reputation design

Ratings must not become a weapon.

- Only allow reviews tied to a real eligible shift lifecycle.
- One review per side per eligible shift unless the product explicitly supports an auditable edit window.
- Keep rating aggregate separate from reliability metrics such as completed shifts and verified no-show rate.
- Consider Bayesian/minimum-count smoothing before prominently ranking new users by tiny sample sizes.
- Do not let blocked/suspended users manipulate each other through repeated reviews.

## Operator tooling

Trust & safety operator actions should be auditable. Require:

- actor/admin id;
- target id;
- action and reason code;
- before/after state where practical;
- timestamp;
- related report/dispute/match ids;
- optional internal note;
- immutable or append-only audit history for high-impact actions.

Coordinate with `staffswipe-security` and `staffswipe-incident-response` for privileged access and incident handling.

## Product safeguards

Before shipping a trust feature, check:

- What happens when the model/rule is wrong?
- Can the user recover or appeal?
- Can attackers learn the threshold cheaply?
- Can one party weaponize the mechanism against the other?
- Is enforcement consistent across workers and venues?
- Is the public UI honest about what a badge or score means?
- Are metrics available to detect false-positive spikes after release?

## Verification

Run relevant backend, TMA, migration, and E2E checks. Add abuse-case tests for authorization, duplicate reports, review eligibility, no-show state transitions, referral abuse, and enforcement bypasses. For security-sensitive paths, also apply `staffswipe-security`.
