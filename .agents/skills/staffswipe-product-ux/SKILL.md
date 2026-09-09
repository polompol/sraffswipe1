# StaffSwipe Product & UX QA

## Mission
Review the product as a real worker and employer, not only as code.

## Core UX
- First-run onboarding explains the value and next action immediately.
- Every network action has loading, success, failure, retry, and empty states.
- Swipe gestures have accessible alternatives.
- Destructive or money-related actions require clear confirmation and explain consequences.
- Employer and seeker permissions are reflected in UI but enforced by API.
- Statuses use text/icons as well as color; avoid ambiguous state presentation.
- Mobile safe areas, keyboard, touch targets, text scaling, dark theme, and reduced motion are respected.
- Error messages are actionable and do not leak internal details.

## Business UX checks
Validate shift publication, candidate discovery, mutual match, confirmation, arrival, attendance, disputes, cancellation, debt blocking, wallet top-up, and support/admin outcomes.

## Rule
Prefer simple flows and explicit state. Do not hide critical business consequences behind gestures or ambiguous labels.