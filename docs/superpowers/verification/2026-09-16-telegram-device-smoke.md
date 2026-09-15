# Telegram Physical Device Smoke — PENDING

This checklist is an external release gate. Browser CI does not satisfy it.

Use the real StaffSwipe Telegram Mini App entry point and a non-production/test-safe environment. Do not paste bot tokens, payment secrets, JWT secrets, or other credentials into this document.

## Result format

For every device record:

- **Status:** `PENDING` | `PASS` | `FAIL`
- **Device:** exact model
- **OS:** exact version
- **Telegram:** exact app version/build if shown
- **Network:** Wi-Fi / mobile / intentionally unstable where relevant
- **Notes:** what happened, with screenshot/video reference if a failure is visual

A platform is complete only when every required row for that platform is `PASS`.

---

## iOS — PENDING

**Status:** PENDING  
**Device:** —  
**OS:** —  
**Telegram:** —  
**Network:** —  
**Notes:** —

| Check | Status | Notes |
| --- | --- | --- |
| Open StaffSwipe from the real bot/Mini App entry point | PENDING | |
| Mini App expands to the expected full available height without a delayed jump | PENDING | |
| Top content clears Telegram header/notch/Dynamic Island area | PENDING | |
| Bottom navigation/fixed controls clear the home indicator | PENDING | |
| Left/right safe areas do not create clipping or horizontal scrolling | PENDING | |
| Telegram BackButton closes card detail/sheet before leaving the route | PENDING | |
| BackButton returns to the underlying route after the top layer closes | PENDING | |
| Chat keyboard opens with composer and Send control fully visible | PENDING | |
| Chat keyboard closes without leaving permanent extra bottom spacing | PENDING | |
| Support form remains scrollable with keyboard open and submit reachable | PENDING | |
| StaffSwipe large-text mode has no clipped primary actions | PENDING | |
| Switch Telegram light ↔ dark theme while Mini App is open; chrome/content remain coherent | PENDING | |
| Swipe cards left/right without accidentally minimizing/closing Mini App | PENDING | |
| Flip a card to details and return using Telegram BackButton | PENDING | |
| Reload/reopen Mini App; safe-area padding is still correct | PENDING | |

---

## Android — PENDING

**Status:** PENDING  
**Device:** —  
**OS:** —  
**Telegram:** —  
**Network:** —  
**Notes:** —

| Check | Status | Notes |
| --- | --- | --- |
| Open StaffSwipe from the real bot/Mini App entry point | PENDING | |
| Mini App expands to the expected full available height without a delayed jump | PENDING | |
| Top content clears Telegram/system status area | PENDING | |
| Bottom navigation/fixed controls clear gesture/navigation controls | PENDING | |
| Left/right safe areas do not create clipping or horizontal scrolling | PENDING | |
| Telegram BackButton closes card detail/sheet before leaving the route | PENDING | |
| BackButton returns to the underlying route after the top layer closes | PENDING | |
| Chat keyboard resize/overlay behavior keeps composer and Send control visible | PENDING | |
| Chat keyboard closes without leaving permanent extra bottom spacing | PENDING | |
| Support form remains scrollable with keyboard open and submit reachable | PENDING | |
| StaffSwipe large-text mode has no clipped primary actions | PENDING | |
| Switch Telegram light ↔ dark theme while Mini App is open; chrome/content remain coherent | PENDING | |
| Swipe cards left/right without accidentally minimizing/closing Mini App | PENDING | |
| Flip a card to details and return using Telegram BackButton | PENDING | |
| Reload/reopen Mini App; safe-area padding is still correct | PENDING | |

---

## Failure handling

If any row is `FAIL`:

1. record device/OS/Telegram versions and exact navigation path;
2. capture screenshot or short screen recording when the failure is visual;
3. note whether it reproduces after a fresh Mini App reopen;
4. do not mark Stage 6 external verification complete;
5. create a focused regression test where browser automation can reproduce the same invariant;
6. fix only the proven defect and re-run repository gates plus the failed physical-device row.

## Release rule

Repository CI can mark Stage 6 **repository-green**, but PR #62 must remain Draft and production release remains blocked until this physical-device checklist has confirmed iOS and Android coverage, together with the other previously defined external release gates.