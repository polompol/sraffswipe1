---
name: staffswipe-tma
description: React/Vite/TypeScript Telegram Mini App guidance for StaffSwipe1. Use for TMA UI, Telegram SDK, navigation, theming, gestures, state, or client API changes.
---

# StaffSwipe1 Telegram Mini App

Work within the existing TMA stack: React 18, TypeScript, Vite, `@tma.js/sdk-react`, React Router, TanStack Query, Zustand, and the existing theme tokens.

## Rules

- Telegram authentication is a server concern: never treat client-exposed init data as trusted identity.
- Preserve Telegram safe areas, viewport behavior, theme integration, and touch/gesture UX.
- Keep business state in the existing API/query/store architecture rather than duplicating server truth in local state.
- Do not expose private fields such as phone or INN in candidate-feed responses.
- Keep UI text/comments in Russian and use existing design tokens from `tma/src/theme/theme.css`; do not introduce arbitrary colors when a token exists.
- For loading/error/empty states, preserve usable Telegram Mini App behavior and avoid blocking navigation unnecessarily.
- Do not add a dependency merely to solve a small UI problem; check the existing stack first.

## Validation

After changes run from `tma/`: `npm run lint`, `npx tsc --noEmit`, `npm run test`, and `npm run build`. For auth/API changes also inspect the matching backend endpoint and tests.
