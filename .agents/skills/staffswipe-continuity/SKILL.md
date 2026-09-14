---
name: staffswipe-continuity
description: Use when continuing StaffSwipe after a pause, across chats or agent sessions, or when the request says continue, resume, finish, or work further on StaffSwipe without restating prior project context.
---

# StaffSwipe Continuity

## Core principle

Continue from the real current project state. Do not reconstruct StaffSwipe from memory and do not restart product design from zero.

## Required context

Before substantial work:
1. Read `docs/PROJECT_BRAIN.md`.
2. Inspect current `main` files relevant to the request.
3. Read the matching source-of-truth docs (`CLAUDE.md`, `DESIGN_SYSTEM.md`, `SECURITY.md`, `README.md`, or relevant `docs/*`).
4. Identify what already exists, what is incomplete, and the exact next step.

## Continuation contract

| Situation | Action |
|---|---|
| Feature already exists | Improve or verify it; do not pitch it as new |
| Chat memory conflicts with code | Trust current executable code for technical facts and surface the conflict |
| User gives a new explicit decision | Treat it as the current product decision and update durable context |
| Work changes architecture, UX, money, security, or state logic | Update affected docs and Project Brain checkpoint |

## Before completion

Run the relevant project verification commands from `AGENTS.md` and perform a short attacker review for sensitive changes.

Then update `docs/PROJECT_BRAIN.md` Checkpoint with what changed, verification, open risks, and the next concrete task.

## Common mistake

A new conversation is **not** a new StaffSwipe project. The repository and Project Brain carry the state forward.
