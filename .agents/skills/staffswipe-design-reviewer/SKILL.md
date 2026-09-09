---
name: staffswipe-design-reviewer
description: Final design review gate for StaffSwipe1. Use before merging substantial UI work to decide PASS, NEEDS FIX, or BRAND DRIFT based on the live design system, UX clarity, accessibility, Telegram behavior, and product identity.
---

# StaffSwipe1 design reviewer

This is the final visual gate, not a generator of alternative styles. Judge whether the implemented change belongs in StaffSwipe and works for the user.

## Required inputs

Inspect the relevant implementation plus:

- `tma/src/theme/theme.css`;
- `tma/src/index.css` and shared UI components involved;
- `DESIGN_SYSTEM.md`;
- applicable visual/product skills;
- rendered states or screenshots when available.

Do not approve from a Figma/mockup alone when implementation differs.

## Review order

### 1. Product clarity

- Is the screen's purpose obvious?
- Is the primary object obvious?
- Is the primary action obvious?
- Can worker and venue users understand the consequences of the action?

### 2. Brand fit

- Does it preserve the burgundy/ivory/wine identity?
- Is Prata used intentionally rather than everywhere?
- Does it feel like premium hospitality work rather than generic SaaS/dating/crypto?
- Does the swipe/card experience remain a recognizable signature where appropriate?

### 3. System consistency

- tokens instead of arbitrary values;
- shared components instead of duplicate local CSS;
- one dominant filled action;
- consistent radii, spacing, elevation, icon language, and typography;
- correct semantic success/danger/verification meaning.

### 4. Information hierarchy

- critical shift/candidate facts appear before secondary metadata;
- trust signals are factual and not visually exaggerated;
- dense information moves into details/progressive disclosure;
- long content does not destroy hierarchy.

### 5. Telegram/mobile behavior

- safe areas;
- viewport resizing;
- keyboard;
- BackButton/MainButton relationship;
- light/dark theme;
- narrow/short screens;
- haptics/motion where applicable.

### 6. Accessibility

- 44px+ targets;
- contrast;
- visible state beyond color alone;
- large text;
- reduced motion;
- readable error/success feedback.

### 7. Performance sanity

- no unjustified large asset/dependency;
- no heavy filters/animations on hot paths;
- stable image/font loading;
- no obvious render churn introduced only for polish.

## Verdicts

### PASS

Use only when:

- no blocker/high visual issue remains;
- design-system alignment is strong;
- role-specific UX is clear;
- required responsive/theme/accessibility states were considered.

### NEEDS FIX

Use when the concept belongs in StaffSwipe but specific implementation defects remain. Provide a short ordered fix list; do not redesign unrelated parts of the product.

### BRAND DRIFT

Use when the implementation is internally polished but creates a competing design language or loses StaffSwipe identity—for example generic glassmorphism, neon dating UI, arbitrary gradients, a second typography system, or a new component framework with different visual rules.

Brand drift is not fixed by tweaking one color; restore the design-system relationship.

## Review scorecard

Score 0-2 for each:

- product clarity;
- brand identity;
- system consistency;
- information hierarchy;
- Telegram/mobile resilience;
- accessibility;
- motion quality where relevant;
- performance restraint.

A high numeric score never overrides a blocker, privacy/safety issue, or misleading trust/payment presentation.

## Output format

Return:

1. `VERDICT: PASS | NEEDS FIX | BRAND DRIFT`;
2. 2-4 sentence rationale;
3. blocking findings first;
4. optional polish suggestions clearly separated from required fixes;
5. verification states actually reviewed.

Avoid subjective taste-only critique. Tie decisions to StaffSwipe's live system and user task.

## Boundaries

- Do not weaken `staffswipe-accessibility`, `staffswipe-security`, `staffswipe-privacy`, or `staffswipe-trust-safety` for aesthetics.
- Do not demand new libraries when existing primitives can solve the problem.
- Do not redesign working areas outside the requested change merely to make the review more dramatic.
- Do not treat a screenshot as proof that interaction, keyboard, safe-area, or motion logic works.

## Verification

For substantial UI changes, pair this review with `staffswipe-visual-qa`. If the verdict is PASS, normal TMA lint/typecheck/tests/build should also pass or the review must clearly state that the engineering verification is still incomplete.
