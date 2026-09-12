---
name: staffswipe-visual-design
description: Visual design and design-system guardrail for StaffSwipe1. Use for any TMA UI, component, layout, card, animation, empty state, iconography, typography, theme, responsive, accessibility, or visual asset change. Prevents random AI-generated styling and preserves the StaffSwipe brand system.
---

# StaffSwipe1 visual design

The source of truth is the live code in `tma/src/theme/theme.css` and `tma/src/index.css`, with `DESIGN_SYSTEM.md` as the documented contract. Do not invent a parallel design language.

## Brand contract

StaffSwipe should feel like a premium hospitality product, not a generic crypto, dating, or gig-work template.

Preserve:

- crimson/burgundy brand on warm ivory in light mode;
- wine-toned dark mode rather than simple inversion;
- Prata only for intentional display moments such as page titles and shift pay/hero values;
- system UI font for fast-reading interface text;
- the shift/candidate card as the dominant object;
- swipe as the signature motion;
- semantic success/danger colors separate from brand color;
- one dominant filled action per screen;
- 44px minimum interactive targets;
- the existing spacing, radius, typography, elevation, and motion token scales.

If documentation and code disagree, inspect the code first and either fix the implementation or update documentation deliberately. Never silently create a third version.

## Hard rules for AI-generated UI

Do not:

- add arbitrary hex colors directly in components when a token exists;
- add one-off font sizes, radii, shadows, z-index ladders, or spacing values without extending the token system intentionally;
- introduce a new visual framework or component library only to style one feature;
- use generic neon gradients, glassmorphism, excessive blur, glowing borders, or random decorative gradients as a shortcut to looking "modern";
- render multiple filled primary buttons competing on one screen;
- make labels look tappable unless they are interactive;
- hide critical actions behind gestures with no discoverable alternative;
- animate for decoration when motion does not explain state or feedback;
- rely on color alone for error/success/verification meaning;
- ship a component that only looks correct in one Telegram theme or one iPhone size.

## Component hierarchy

When designing a screen, establish this hierarchy:

1. one screen purpose;
2. one visual hero/primary object;
3. one primary action;
4. secondary actions with lower visual weight;
5. supporting metadata;
6. progressive disclosure for rarely used actions.

Prefer composable existing components before adding new ones. If a new reusable pattern is introduced, document its purpose and add it to the shared component/design system rather than cloning local CSS.

## Shift card quality bar

A shift card should make these facts scannable within seconds:

- role;
- pay/estimated earnings;
- date and start/end time;
- venue name;
- distance/location context when available;
- trust/verification state when meaningful;
- key conditions such as meals, taxi, uniform, experience/medical-book requirements;
- clear swipe/like/pass affordances.

Do not overload the card with every database field. Use details or sheets for secondary information.

## Worker/candidate card quality bar

Prioritize:

- name and role;
- relevant experience;
- reliability/completed-shift indicators;
- distance/availability;
- verification status;
- compact skill/condition tags;
- clear action hierarchy.

Sensitive or unnecessary personal data must not appear merely because it exists in the model. Coordinate with `staffswipe-privacy` and `staffswipe-trust-safety`.

## Motion language

Motion must communicate intent and remain quick.

- swipe: spring-based card movement tied to gesture direction;
- press: subtle scale feedback;
- match: short one-time celebratory overlay;
- successful completed shift/payment: short celebratory moment;
- sheets/dialogs: predictable entrance/exit;
- skeleton/loading: stable layout, no content jump;
- respect `prefers-reduced-motion` and provide equivalent state feedback without motion.

Avoid animations that block input or stretch beyond the product's existing motion budget unless there is a strong reason.

## Telegram-specific visual rules

- honor safe-area insets and viewport changes;
- test Telegram light/dark themes and the project theme override behavior;
- avoid controls underneath Telegram chrome/home indicator;
- ensure BackButton/MainButton integration does not duplicate on-screen actions confusingly;
- handle keyboard opening without hiding the focused input or send action;
- use haptics as reinforcement, never as the only feedback.

Coordinate platform mechanics with `staffswipe-telegram-platform`.

## Responsive and accessibility checks

Review at minimum:

- narrow mobile width;
- tall and short viewport;
- large-text mode;
- light and dark theme;
- reduced motion;
- keyboard focus/navigation where applicable;
- contrast and readable muted text;
- long Russian labels/names/venue names;
- loading, empty, error, disabled, success, and offline-like states.

## Visual asset policy

For icons, illustrations, badges, and venue placeholders:

- use one coherent icon family/style;
- do not mix outline weights or illustration styles randomly;
- verification badges must have precise semantics;
- decorative assets must not imitate official identity/document seals;
- optimize raster images to modern formats where the app pipeline supports them;
- provide graceful placeholders to avoid layout collapse;
- avoid shipping large ornamental assets that hurt TMA startup performance.

## Review checklist

Before approving any UI change ask:

- Does this still look unmistakably like StaffSwipe?
- Did we reuse tokens/components instead of inventing local styling?
- Is the primary action obvious?
- Can the user understand the state without color alone?
- Does the screen work in dark mode, large mode, and reduced motion?
- Is the swipe/card experience still the visual center where appropriate?
- Did we add any visual flourish that costs performance without improving comprehension?

## Verification

Run TMA lint, typecheck, tests, and build. Add or update focused visual/design-system tests when adding tokens or interaction-size rules. Also apply `staffswipe-accessibility`, `staffswipe-performance`, and `staffswipe-telegram-platform` when relevant.
