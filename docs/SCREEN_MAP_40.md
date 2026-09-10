# StaffSwipe — Screen Map 40

> Canonical product/UI map for coding agents (including GPT-6 Astra). This file describes what each user-facing screen is for, which role sees it, and the business guardrails that must not be violated.

## Core product path

`Entry → Profile → Feed → Mutual choice → Chat → Confirmed shift → Protected execution → Close → Review → Commission`

Do not invent new monetization, API fields, payment semantics, or trust badges. Current monetization is the service commission on a closed shift. Use existing backend/domain entities and mark future concepts explicitly as TODO rather than presenting them as implemented.

## 01. Shared entry and setup

1. **First launch** — concise value proposition, protected-shift concept, 18+ context.
2. **Role choice** — `Ищу смену` / `Ищу сотрудника`.
3. **Telegram auth + consents** — Telegram initData authentication, required consent flow.
4. **City + notifications** — location/city setup and Telegram notification permission/education.
5. **Welcome / enter product** — profile readiness and primary CTA to the feed.

## 02. Worker flow

6. **Worker profile setup** — name, photo, role, city, experience, skills, bio.
7. **Worker documents / verification** — medical book, self-employment status, phone/verification states.
8. **Availability** — dates/dayparts/area preferences and availability status.
9. **Worker swipe feed** — primary discovery surface for shifts. Large venue photo, role, payout, time, distance, trust cues.
10. **Worker list feed** — alternative list mode for comparing several shifts.
11. **Worker filters** — role, payout, date, area, experience/document constraints, verified-only, sorting.
12. **Shift details** — duties, uniform, address, payout, requirements, venue information.
13. **Worker favorites** — saved shifts/venues.
14. **Invite received** — employer-initiated invitation with terms and response controls.
15. **Worker “Мои смены”** — unified lifecycle list: negotiating, confirmed, today, completed, disputed.

## 03. Employer flow

16. **Venue profile setup** — name, type, photos, address, description/contact details.
17. **Venue verification** — INN/OGRN/phone verification state; do not expose sensitive identifiers in public feed.
18. **Employer swipe feed** — candidate discovery. Portrait, role, experience, rating, completed shifts, reliability/availability cues.
19. **Candidate full profile** — skills, documents, reviews, availability, experience/history.
20. **Candidate filters** — role, experience, documents, rating, distance, availability, sorting.
21. **Saved workers / shortlist** — candidates saved for later invitations.
22. **Create shift: basics** — role, date, start/end, worker count, payout.
23. **Create shift: conditions** — duties, uniform, break, payout method/conditions.
24. **Create shift: requirements** — experience, documents, skills; avoid discriminatory fields.
25. **Create shift: preview + publish** — preview exactly as worker will see it before publish.
26. **Employer “Смены”** — drafts, open, filled, completed, cancelled vacancies.
27. **Applicants / assigned people** — applicants, invited, confirmed workers and who is expected to show up.

## 04. Mutual choice + shift lifecycle

28. **Mutual interest** — both sides selected each other; use work-oriented language, not dating language.
29. **Shift chat** — conversation tied to a specific match/shift; pinned shift summary (payout, time, address).
30. **Confirm conditions** — both sides explicitly confirm final conditions.
31. **Protected shift / check-in** — venue code as evidence of attendance; confirmation checklist / anti-no-show logic.
32. **Shift in progress** — active state, end time, quick chat/support access.
33. **Reschedule / cancel** — allowed before start with explicit reason and updated terms.
34. **Close shift / actual hours / review entry** — shift closes unless reported as not completed; actual hours may be clarified within the permitted window; route to review.

## 05. Safety, money, growth and operations

35. **No-show / shift did not happen** — explicit action + reason; never infer from silence.
36. **Dispute** — structured issue flow for operator review.
37. **Support / report** — report profile, shift, message, or technical problem.
38. **Employer wallet / top-up** — balance and YooKassa top-up; transaction history.
39. **Commission + PDF act** — service commission after a closed shift; self-employed work act / billing history where applicable.
40. **Service operations** — saved-search alerts, referrals/share, funnel analytics and admin/operator tools. These are distinct subfeatures even when represented as a combined map node.

## Navigation guardrails from current app

Worker tab bar:
- `Лента` → `/feed`
- `Мои смены` → `/matches`
- `Профиль` → `/profile`

Employer tab bar:
- `Лента` → `/feed`
- `Люди` → `/matches`
- `Смены` → `/vacancy/my`
- `Профиль` → `/profile`

Known supporting routes include `/profile/edit`, `/vacancy/new`, `/chat/:matchId`, `/favorites`, `/workers`, `/applicants`, `/invites`, `/settings`, `/support`, `/funnel`, `/admin`.

## UX language rules

- Worker primary positive action: **Откликнуться / Готов к смене** depending on context.
- Employer primary positive action: **Пригласить**.
- Mutual state: **Взаимный интерес / Условия согласованы**.
- Avoid dating terms such as “лайк” or “мэтч” in normal end-user copy unless used only internally.
- Keep the core experience light: discover → choose → agree → work → close.

## Visual system guardrails

- Crimson `#A51C30` — primary action / brand.
- Ivory `#EFE7D3` — main background.
- Card `#FFFDF8`.
- Text `#241F1B`.
- Gold `#C39A3A` — premium/result/trust accent.
- Green `#2F7A4D` — confirmed/safe state.
- Main discovery card is the dominant visual object.
- Use large hospitality/candidate photography, clear payout/role/time hierarchy, compact trust metadata, and consistent action controls.

## Implementation rule for Astra

Before changing a screen:
1. Identify the role and route/component that owns it.
2. Check which fields actually exist in API/types/backend models.
3. Reuse design tokens/components before adding new CSS.
4. Preserve matching, confirmation, settlement and dispute semantics.
5. Add/update tests for meaningful behavioral changes.
6. If a concept from Canva is not represented in the backend, mark it as a design TODO instead of fabricating data.
