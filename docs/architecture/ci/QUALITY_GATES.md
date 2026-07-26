# CI Quality Gates

Blocking: `typecheck`, `lint:changed`, `test:contracts`, `test:architecture`, `test:tenant`, `test:rls`, `test`, `build`.

Informational (pre-existing debt): `lint` (full repo) — runs with `|| true`; tracked in `technical-debt/LINT_BASELINE.md`.

External gates (not in default CI):

- Runtime cross-tenant RLS matrix — requires two-tenant fixture DB. Status per run must be one of: run | skipped | blocked | failed. Never report `run` if skipped.
