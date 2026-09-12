---
name: staffswipe-visual-qa
description: Visual QA for StaffSwipe1. Use after UI changes to catch layout, token, typography, contrast, safe-area, dark-mode, large-text, loading, empty-state, and gesture regressions before merge.
---

# StaffSwipe1 visual QA

Visual correctness is part of product correctness. Review actual rendered states, not only component code.

## Scope

Apply after changes to screens, cards, navigation, forms, sheets, modals, themes, typography, photos, icons, animations, safe areas, or shared CSS.

Combine with `staffswipe-visual-design`, `staffswipe-accessibility`, `staffswipe-telegram-platform`, and the relevant feature skill.

## Minimum state matrix

For every changed surface inspect, where applicable:

- light theme;
- dark theme;
- narrow viewport;
- short viewport;
- large-text mode;
- reduced motion;
- keyboard open;
- loading;
- empty;
- error;
- disabled;
- success;
- long Russian content;
- missing photo/optional data.

Do not approve based only on the happy path.

## Layout defects to catch

- content behind Telegram/browser chrome;
- bottom actions touching the home indicator;
- safe-area doubled or missing;
- cards clipping during swipe;
- horizontal overflow;
- sheet content taller than viewport with inaccessible CTA;
- keyboard hiding input/send action;
- sticky header/footer covering content;
- inconsistent card widths/radii;
- unexpected layout shift after image/font load;
- modal close/back behavior leaving a dead overlay.

## Typography defects

- font smaller than the design-system minimum;
- accidental synthetic bold on Prata;
- line-height clipping Cyrillic or ₽;
- pay/time truncation;
- long venue names colliding with badges/actions;
- muted text losing contrast in dark mode;
- inconsistent numeric formatting for money/time/distance.

## Component consistency defects

- local hex colors where a token exists;
- new one-off radius/shadow/spacing values;
- filled buttons competing for primary status;
- tags styled like buttons without interaction;
- mixed icon weights/sizes;
- tap targets below 44px;
- destructive action visually stronger than the primary flow without reason.

## Swipe and motion QA

- card returns cleanly below threshold;
- commit occurs once above threshold;
- rapid swipe/button combination does not duplicate action;
- next card does not flash or jump;
- reduced-motion state remains understandable;
- match animation does not replay unnecessarily;
- haptics are not fired repeatedly during drag.

## Image QA

- no broken aspect ratios;
- focal subject survives crop;
- placeholder dimensions match loaded image dimensions;
- text over imagery remains readable on bright/dark photos;
- lazy loading does not collapse layout;
- avatar/venue fallback is intentional rather than a broken-image icon.

## Accessibility visual checks

- visible focus where keyboard focus is supported;
- state not communicated by color alone;
- contrast meets project rules;
- zoom/large text does not hide actions;
- errors are adjacent to the relevant field/action;
- motion does not become required to understand a result.

## Regression discipline

When existing visual tests/screenshot infrastructure exists, update baselines only after explaining the intended visual change. Never mass-accept diffs merely to make CI green.

If screenshot infrastructure does not exist, do not add a heavy new service solely for one PR. Prefer the existing E2E stack and targeted rendered-state tests until a deliberate visual-regression system is chosen.

## Severity

- BLOCKER: hidden primary action, unusable viewport, privacy leak, unreadable critical text, broken theme, inaccessible flow.
- HIGH: major brand/token drift, repeated double-action visual state, broken swipe, large layout collision.
- MEDIUM: inconsistent spacing, icon mismatch, weak empty/error state, non-critical truncation.
- LOW: minor optical alignment that does not affect comprehension.

## Review output

Report findings with:

- severity;
- screen/state;
- exact component/file when known;
- expected behavior;
- observed behavior;
- smallest safe fix.

Do not use “looks bad” as a finding; make every visual issue actionable.

## Verification

Run normal TMA lint, typecheck, tests, and build. Re-check the changed state matrix after fixes rather than assuming a code change solved the rendered problem.
