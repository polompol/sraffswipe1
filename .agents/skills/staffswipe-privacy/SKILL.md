# StaffSwipe Privacy & PII

## Mission
Minimize personal-data exposure and make every data flow intentional, bounded, and auditable.

## Rules
- Collect only data required for matching, legal/accounting duties, or explicit product functionality.
- Never log Telegram initData, JWTs, passwords, SMS/OTP values, arrival/check-in codes, payment secrets, document images, or unnecessary PII.
- Keep sensitive fields out of candidate feeds until business rules permit disclosure.
- Do not persist document photos unless explicitly required and protected by a documented retention policy.
- Enforce server-side ownership on profile, documents, matches, messages, and exports.
- Define retention/deletion behavior for accounts, documents, analytics, and financial records.
- Redact PII in errors, traces, metrics, fixtures, screenshots, and test data.

## Review checklist
For every new field ask: why is it needed, who can read it, who can modify/delete it, how long is it retained, whether it is indexed/logged/exported, and whether a less-sensitive representation works.

Privacy regressions are release blockers when they cross an authorization boundary.