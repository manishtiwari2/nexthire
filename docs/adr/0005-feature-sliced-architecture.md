# ADR 0005: Symmetrical Feature-Sliced Frontend & Backend Architecture

## Status
Accepted (Frozen Architecture)

## Context
Large web applications organized purely by file type (`controllers/`, `components/`, `routes/`) suffer from high coupling, file sprawl, and poor maintainability over time.

## Decision
We adopt a **symmetrical feature-sliced design** for both `client/src/features/` and `server/src/features/`:
- `auth`: Google authentication & role assignment.
- `dashboard`: Real derived analytics & activity heatmaps.
- `question-bank`: Problem bank CRUD, topics, tags, and Monaco practice IDE.
- `contest`: Speed contests, contest questions, invites, and live leaderboard sync.
- `interview`: Mock interview scheduling, waiting room hardware checks, and evaluation reports.
- `judge`: Isolated queue worker for code execution.
- `revision`: Spaced repetition SM-2 review deck.
- `profile`: User profiles, bio, and skill portfolio.
- `admin`: Platform management suite & user moderation.

## Consequences
- High cohesion and minimal cross-feature dependency.
- Easy to test, refactor, or expand individual domains independently.
