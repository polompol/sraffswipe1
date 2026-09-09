---
name: staffswipe-accessibility
description: Accessibility and inclusive UX review for StaffSwipe1 TMA. Use for UI components, forms, navigation, gestures, dialogs, colors, motion, or interactive controls.
---

# StaffSwipe1 accessibility

Accessibility is part of UI correctness, not an optional enhancement.

- Preserve readable contrast in both themes; use existing semantic tokens.
- Never communicate meaning by color alone. Pair success, danger, selected, and status states with text, icons, or other cues.
- Interactive controls need an accessible name, visible keyboard focus, and a touch target large enough for reliable tapping.
- Form inputs need labels, useful autocomplete/input modes, clear validation, and errors associated with the relevant field.
- Dialogs/popups must manage focus and have an obvious close/cancel path.
- Swipe gestures must have an equivalent explicit action; essential functionality cannot require a gesture alone.
- Respect `prefers-reduced-motion`; do not make critical state changes depend on animation.
- Preserve dynamic text sizing without clipping or breaking buttons/cards.
- Images need meaningful alt text when informative and empty alt text when decorative.
- Do not use placeholder text as the only label.
- Test changed screens with keyboard navigation and, where practical, VoiceOver/TalkBack semantics.

For every UI change check: focus, labels, semantics, contrast, touch size, reduced motion, zoom/text scaling, and non-gesture alternatives.
