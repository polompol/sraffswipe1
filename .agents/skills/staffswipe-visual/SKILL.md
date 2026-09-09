---
name: staffswipe-visual
description: Visual quality and UX review for StaffSwipe1 TMA. Use for screens, components, swipe cards, animations, responsive layouts, themes, typography, icons, and visual polish.
---

# StaffSwipe1 visual quality

Treat `DESIGN_SYSTEM.md` and `tma/src/theme/theme.css` as the visual source of truth.

- Preserve the crimson + ivory + gold brand language and existing semantic tokens.
- Do not introduce arbitrary colors, font sizes, radii, shadows, or button dimensions when a token exists.
- Keep the swipe card as the primary visual object: amount, role, time, distance, and venue photo must remain scannable in seconds.
- Check light/dark themes, Telegram safe areas, small phones, large phones, and keyboard/viewport behavior.
- Interactive targets should remain comfortable for touch; preserve the existing button scale and focus ring.
- Every changed screen needs intentional loading, empty, error, disabled, pressed, and success states.
- Motion should communicate swipe/confirmation/state change, not decoration. Respect `prefers-reduced-motion`.
- Avoid layout shift, text clipping, overflow, unsafe fixed positioning, and content hidden behind Telegram/system UI.
- Use real project components and tokens before creating one-off CSS.
- Keep Russian UI copy concise and consistent with the existing product voice.

Before finishing, visually inspect the affected screen at mobile sizes and both themes. Fix visual regressions instead of merely documenting them.
