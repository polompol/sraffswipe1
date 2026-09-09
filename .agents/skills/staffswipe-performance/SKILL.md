---
name: staffswipe-performance
description: Performance review for StaffSwipe1 React/Vite Telegram Mini App and backend. Use for rendering, data fetching, images, bundles, API latency, caching, or background jobs.
---

# StaffSwipe1 performance

Optimize measured bottlenecks without sacrificing correctness or UX.

## TMA

- Avoid unnecessary React re-renders; keep server state in TanStack Query and local UI state focused.
- Do not duplicate API data into Zustand unless there is a clear reason.
- Lazy-load routes/heavy features where it improves startup without making core navigation sluggish.
- Optimize venue photos and avoid loading images that are not near the viewport.
- Prevent request waterfalls; parallelize independent API calls.
- Keep swipe interactions at a smooth frame rate and avoid expensive work during drag/animation.
- Avoid large dependencies for small tasks and inspect bundle impact before adding packages.
- Handle offline/slow-network states gracefully and avoid duplicate mutations.

## Backend

- Use bounded pagination and limits on collection endpoints.
- Avoid N+1 database queries; use appropriate eager loading or explicit joins.
- Keep transactions short and do not perform network I/O inside database transactions.
- Cache only data whose staleness is acceptable; never cache authorization-sensitive results across users.
- Scheduler jobs must remain idempotent and must not multiply work after retries.

## Verification

Measure before and after when possible. For frontend changes run lint/typecheck/tests/build; for backend changes run lint/tests and inspect query behavior for hot endpoints. Do not optimize by weakening security checks or consistency guarantees.
