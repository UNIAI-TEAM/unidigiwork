# Lint Baseline (pre-existing debt)

Repo entered Batch 0C with ~904 lint findings, almost entirely Prettier formatting. Full-repo cleanup is out of scope for Batch 0C (would create a diff too large to review).

Strategy:
- `bun run lint:changed` — blocking; enforces cleanliness on files touched by Batches 0A/0B/0C.
- `bun run lint` — informational only in CI.
- Backlog: schedule a dedicated formatting-only PR before Phase 1 feature work.
