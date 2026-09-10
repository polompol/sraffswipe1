# StaffSwipe — UX Blueprint V3 · 150 screens

This document is the implementation companion to the Canva design **StaffSwipe — Full UX Blueprint V3 · 150 Screens**.

Canva design ID: `DAHUzGl9APo`

## Purpose

The blueprint makes StaffSwipe understandable to a coding model without forcing it to infer product behaviour from mockups. Every screen belongs to a role, route, component, state and API contract. The visual design is not a source of new backend fields: if the UI needs data that the API does not return, change backend schema + endpoint + client type + mock + tests before using it.

## Ergonomics contract V3

- Telegram Mini App frame: 390×844 reference size.
- Minimum touch target for V3 controls: 52 px.
- Primary bottom CTA: 60–64 px high and kept in the thumb zone.
- Bottom navigation: 68–72 px.
- One filled primary CTA per screen; secondary actions are outline/ghost.
- Destructive actions require an explicit confirmation sheet.
- Swipe screens use a large card + visible next-card stack + large bottom action dock.
- Worker navigation: `Лента / Мои смены / Профиль`.
- Employer navigation: `Лента / Люди / Смены / Профиль`.
- Dark mode, large text and reduced-motion are part of the design contract, not optional polish.

## Product invariants

1. `tg_id` is the user identity.
2. A mutually agreed shift is considered held by default unless someone explicitly marks it not held.
3. Worker confirmation is sufficient for settlement flow; employer silence cannot be used to avoid the service fee.
4. Check-in code is evidence for a dispute, not a billing trigger.
5. StaffSwipe revenue is currently **10% of a completed/closed shift**.
6. Do not store document/medical-book photos; only statuses.
7. Do not expose phone, INN or other sensitive profile data in public feed cards.
8. Employer verification badge is operator-controlled.
9. SwipeDeck behaviour (rollback on server error, keyboard accessibility, haptic, reduced-motion) must be preserved.
10. Money operations remain atomic and idempotent.

## Screen registry

### S001–S010 · Foundation / AI contract

- S001 Blueprint: how to read the project.
- S002 Product architecture.
- S003 Route map.
- S004 Worker navigation.
- S005 Employer navigation.
- S006 Shift state machine.
- S007 Swipe interaction system.
- S008 Thumb-zone and bottom actions.
- S009 Design tokens and components.
- S010 Data-contract rules.

### S011–S028 · Shared auth + onboarding

- S011 Splash / app boot.
- S012 Welcome.
- S013 Role selection.
- S014 Telegram auth.
- S015 Auth loading.
- S016 Auth error / retry.
- S017 Worker personal data.
- S018 Worker roles.
- S019 Worker experience.
- S020 Worker document statuses.
- S021 Worker permissions.
- S022 Worker profile ready.
- S023 Employer company basics.
- S024 Employer venue type/name.
- S025 Employer address/photo.
- S026 Employer contact data.
- S027 Employer verification pending.
- S028 Employer ready.

Routes/components: `/onboarding` → `Onboarding`, `/role` → `RolePage`, `/welcome` → `WelcomePage`.

### S029–S068 · Worker journey

- S029 Shift feed swipe — `/feed`, `FeedPage`, `GET /vacancies`, `POST /swipes`.
- S030 Shift-card details.
- S031 Swipe right / positive action.
- S032 Swipe left / skip.
- S033 Swipe server error + card rollback.
- S034 Quick shift filters.
- S035 Advanced shift filters.
- S036 Filtered feed empty state.
- S037 Location unavailable; manual city fallback.
- S038 Favorites — `/favorites`, `FavoritesPage`.
- S039 Incoming invitations — `/invites`, `InvitesPage`, `GET /vacancies/invites`.
- S040 Invitation details.
- S041 Mutual match overlay.
- S042 Match details.
- S043 Worker `Мои смены` list — `/matches`, `MatchesPage`.
- S044 Shift chat — `/chat/:matchId`, `ChatPage`.
- S045 Chat with keyboard open.
- S046 Earlier-message pagination.
- S047 Confirm shift — `POST /matches/:id/confirm`.
- S048 Shift-conflict warning — `409 shift_conflict`, force-confirm path.
- S049 Confirmed shift.
- S050 Reschedule offer.
- S051 Reschedule accepted.
- S052 Reschedule declined.
- S053 Cancel shift — `POST /matches/:id/cancel`.
- S054 Mark shift not held — `POST /matches/:id/not-held`.
- S055 Enter check-in code — `POST /matches/:id/checkin`.
- S056 Check-in success.
- S057 Shift in progress.
- S058 Worker sees changed actual hours.
- S059 Open dispute — `POST /matches/:id/dispute`.
- S060 Dispute in review.
- S061 Completion pending/default-held window.
- S062 Completed shift + result summary.
- S063 Leave venue review — `POST /matches/:id/review`.
- S064 Worker profile — `/profile`, `ProfilePage`.
- S065 Edit worker profile — `/profile/edit`, `EditProfilePage`.
- S066 `Готов выйти сегодня` — `POST /me/available`.
- S067 Referral data — `GET /referral/me`.
- S068 Worker notifications/deep links.

### S069–S112 · Employer journey

- S069 Employer home.
- S070 Candidate feed swipe — `/feed`, `GET /candidates`, `POST /swipes`.
- S071 Candidate-card details.
- S072 Swipe candidate right / invite.
- S073 Swipe candidate left / skip.
- S074 Candidate swipe server error + rollback.
- S075 Quick candidate filters.
- S076 Advanced candidate filters.
- S077 Candidate feed empty state.
- S078 Candidate profile; only public Seeker/Reliability fields.
- S079 My workers — `/workers`, `WorkersPage`, `GET /employer/workers`.
- S080 Repeat invitation — `POST /employer/invite/:userId`.
- S081 New vacancy basics — `/vacancy/new`, `CreateVacancyPage`.
- S082 Vacancy date/time/headcount.
- S083 Vacancy rate/pay method/tips.
- S084 Vacancy requirements.
- S085 Vacancy preview.
- S086 Publish success — `POST /vacancies`.
- S087 My vacancies — `/vacancy/my`, `MyVacanciesPage`.
- S088 Manage vacancy.
- S089 Edit vacancy — `PUT /vacancies/:id`.
- S090 Edit blocked because applicants exist (`409`).
- S091 Remove vacancy.
- S092 Remove blocked because applicants exist (`409`).
- S093 Urgent ping — `POST /vacancies/:id/urgent` and show returned `pinged` count.
- S094 Applicants list — `/applicants`, `ApplicantsPage`, `GET /employer/applicants`.
- S095 Applicant details tied to exact vacancy/date/time.
- S096 Decline applicant.
- S097 Reconsider a previously declined applicant.
- S098 Employer match/invite success; show exact matched vacancy.
- S099 Employer `Люди` list — `/matches`, `MatchesPage`.
- S100 Manage person + agreed shift.
- S101 Employer shift chat.
- S102 Propose reschedule — `POST /matches/:id/reschedule`.
- S103 Set actual hours — `POST /matches/:id/hours`.
- S104 Mark attendance — `POST /matches/:id/attendance`.
- S105 Employer check-in code helper.
- S106 Employer active shift.
- S107 Completed shift + commission state.
- S108 Employer profile.
- S109 Employer verification status.
- S110 Employer funnel analytics — `/funnel`, `FunnelPage`.
- S111 Employer settings — `/settings`, `SettingsPage`.
- S112 Team reliability stats.

### S113–S121 · Protected shift + money

- S113 Protected Shift overview.
- S114 Shift timeline.
- S115 Settlement pending.
- S116 10% commission breakdown.
- S117 Insufficient employer balance.
- S118 Balance top-up.
- S119 Top-up success/idempotent payment result.
- S120 Transaction history.
- S121 PDF act where the self-employed flow supports it.

### S122–S134 · Safety + support + system states

- S122 Report target — `POST /reports`; reasons: spam/fake/scam/abuse/other.
- S123 Support home — `/support`, `SupportPage`.
- S124 Support request form.
- S125 Dispute opened.
- S126 Operator reply.
- S127 Notification center.
- S128 Telegram deep-link routing with auth/role gate.
- S129 Account/privacy settings.
- S130 Offline.
- S131 API error/retry.
- S132 Loading/skeleton.
- S133 Contextual empty list.
- S134 Maintenance state without invented recovery ETA.

### S135–S143 · Admin / operations

- S135 Admin overview — `/admin`, `AdminPage`, `GET /admin/overview`.
- S136 Reports queue — `GET /admin/reports`.
- S137 Disputed-shift facts.
- S138 Dispute chat — only where report/dispute grants operator access.
- S139 User search / employer verification / blocking.
- S140 Revenue — `GET /admin/revenue`; written-off commission is not revenue.
- S141 Notification health — `GET /admin/notifications`.
- S142 Scheduler job health — `GET /admin/jobs`.
- S143 Product funnel — open → swipe → match → confirm → done.

### S144–S150 · Cross-cutting QA states

- S144 Large-text/accessibility layout.
- S145 Dark mode.
- S146 Reduced motion.
- S147 Permission prompt pattern.
- S148 Destructive confirmation sheet.
- S149 Success/celebration pattern (<800ms; reduced-motion safe).
- S150 Implementation index for GPT-6.

## Implementation workflow for GPT-6 Astra

For any S-ID:

1. Read `AGENTS.md` and `CLAUDE.md` first.
2. Resolve the S-ID in this blueprint.
3. Open the existing route/component before creating a new component.
4. Check `tma/src/api/endpoints.ts` and `tma/src/types/domain.ts` for required data.
5. If a field is missing, change backend schema/model/endpoint + client type + mock + migration if needed + tests.
6. Reuse tokens in `tma/src/theme/theme.css` and shared components in `tma/src/index.css`.
7. Preserve the V3 bottom-action ergonomics: 52px touch minimum, 60–64px primary CTA, 68–72px bottom nav.
8. Preserve SwipeDeck safety/accessibility behaviour.
9. Run lint, TypeScript, unit tests, build, verify and E2E for flow/layout changes.
10. Do not mark implementation complete while required CI is red.

## Source priority

Working code/tests > `CLAUDE.md` > `AGENTS.md` > `DESIGN_SYSTEM.md` + tokens > this UX blueprint > visual Canva mockups.
