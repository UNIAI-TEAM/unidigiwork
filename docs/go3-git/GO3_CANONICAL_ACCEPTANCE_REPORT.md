# GO-3 canonical acceptance report (source)

Date: 2026-09-15.

This is **code/source acceptance** on `feature/go3-option-b` against `UNIAI-TEAM/unidigiwork`. It is **not** Lovable production runtime acceptance. Cursor did not apply production migration or backfill.

## Source vs runtime

| Layer | Status |
| --- | --- |
| Canonical Git rebase of Option B | `feature/go3-option-b` |
| `bun run typecheck` | 0 |
| GO-3 unit tests (mapping, projector, adapters) | 15 passed |
| `test:architecture` | 0 |
| `test:tenant` / `test:rls` | 0 / 0 |
| `bun run build` | 0 |
| `bun run test` (full) | 6 failed, all **PRE_EXISTING** on `origin/main` (schema `meetings.starts_at` in `work-deliverables.functions.ts`; domain-sdk box/CEO/projects; uni-copilot `.from`). None in GO-3 files |
| Cloud integration SQL `15_go3_option_b_work_graph.sql` | Present; **not executed** (no production DB) |
| Production graph / live outbox | `NOT_RUN` |

## Architecture preserved

- Option B: WORK_PRODUCT (`work_products.id`) ≠ DOCUMENT (`documents.id`)
- `work_product_versions` business/content; `document_versions` Office/file
- `work_units` catalog unchanged
- Office `save.complete` still writes one `document_versions` row and emits `document.version.created`
- Historical `document.document.version_uploaded` still projected
- Existing `work_graph_backfill` RPC untouched; GO-3 uses `go3_work_graph_backfill`

## Next tool

TARGET TOOL: LOVABLE  
Apply migration `20260915090000_go3_option_b_work_graph.sql`, run integration test 15, bounded backfill, live three-state proof.

Do not start GO-4 from this report.
