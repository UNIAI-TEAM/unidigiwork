#!/usr/bin/env bash
# =============================================================================
# Integration test: concurrent quota race
# Fires N parallel psql sessions calling create_task / upload_document_version
# and asserts:
#   - create_task:              exactly L succeed, N-L raise QUOTA_EXCEEDED
#                               (no more than L rows land in public.tasks)
#   - upload_document_version:  the FOR UPDATE row lock serialises concurrent
#                               uploads; the storage counter never exceeds the
#                               entitlement limit and only the version that
#                               would push past the limit raises QUOTA_EXCEEDED.
# Uses a throwaway tenant that is purged at the end via _test_purge_tenant.
# =============================================================================
set -uo pipefail

OWNER='999a12c6-85b6-4327-8469-b91fc7a8e765'
SLUG="itest-conc-$(date +%s)-$RANDOM"
WORK="/tmp/itest_conc/$$"
mkdir -p "$WORK"
trap 'rm -rf "$WORK"' EXIT

JWT="json_build_object('sub','$OWNER','role','authenticated')::text"

# Extract the last UUID-looking token from psql output (skips SET/set_config rows).
extract_uuid() {
  awk 'match($0, /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/) {
         v = substr($0, RSTART, RLENGTH)
       } END { print v }'
}

# ---------- setup: tenant + workspace + entitlements + base document ---------
PROV="$(psql -tAX -F ' ' -v ON_ERROR_STOP=1 <<SQL
SELECT set_config('request.jwt.claims', $JWT, false);
SELECT tenant_id::text || ' ' || workspace_id::text
FROM public.provision_tenant('itest_conc','$SLUG','$OWNER'::uuid,'WS-CONC');
SQL
)"
# Keep only the line with two UUIDs separated by a space.
PROV="$(echo "$PROV" | awk 'NF==2 && $1 ~ /^[0-9a-f-]{36}$/ && $2 ~ /^[0-9a-f-]{36}$/ { print }')"
read TENANT WS <<<"$PROV"
if [ -z "${TENANT:-}" ] || [ -z "${WS:-}" ]; then
  echo "FAIL setup: provision_tenant returned empty (tenant=$TENANT ws=$WS)"; exit 1
fi

cleanup() {
  psql -tAX -v ON_ERROR_STOP=0 -c "SELECT public._test_purge_tenant('$TENANT'::uuid);" >/dev/null 2>&1 || true
  rm -rf "$WORK"
}
trap cleanup EXIT

LIMIT_TASKS=5
PARALLEL_TASKS=8
PARALLEL_DOCS=5
DOC_SIZE=1024
LIMIT_BYTES=$((DOC_SIZE * 3))   # only 3 uploads should fit

psql -tAX -v ON_ERROR_STOP=1 >/dev/null <<SQL
SELECT public._test_seed_entitlement('$TENANT'::uuid, 'tasks.active', true, $LIMIT_TASKS);
SELECT public._test_seed_entitlement('$TENANT'::uuid, 'documents.storage_bytes', true, $LIMIT_BYTES);
SQL

# One empty document per parallel worker — parallel uploads then contend on
# the shared documents.storage_bytes counter without FOR UPDATE serialising
# them (each locks its own row).
DOC_IDS=()
for i in $(seq 1 $PARALLEL_DOCS); do
  d="$(psql -tAX -v ON_ERROR_STOP=1 <<SQL | extract_uuid
SELECT set_config('request.jwt.claims', $JWT, false);
SELECT (public.create_document('$WS'::uuid,'conc-doc-'||$i,'My Documents',
          ARRAY[]::text[], NULL, NULL, 0,
          'conc-doc-init-'||$i||'-'||md5(random()::text), NULL)).id;
SQL
)"
  if [ -z "$d" ]; then echo "FAIL setup: create_document $i returned empty"; exit 1; fi
  DOC_IDS+=("$d")
done

# ---------- test A: concurrent create_task -----------------------------------
for i in $(seq 1 $PARALLEL_TASKS); do
  (
    psql -tAX -v ON_ERROR_STOP=0 -c "
      SELECT set_config('request.jwt.claims', $JWT, false);
      SELECT (public.create_task('$WS'::uuid,'ct-'||$i,NULL,'normal',NULL,NULL,
              'conc-t-'||$i||'-'||md5(random()::text),NULL)).id;
    " > "$WORK/task_$i.out" 2>&1
    echo "__rc=$?" >> "$WORK/task_$i.out"
  ) &
done
wait

succ=0; qerr=0; other=0
for f in "$WORK"/task_*.out; do
  if grep -q 'QUOTA_EXCEEDED' "$f"; then
    qerr=$((qerr+1))
  elif grep -q '__rc=0' "$f"; then
    succ=$((succ+1))
  else
    other=$((other+1))
    echo "  unexpected task output ($f):"; sed 's/^/    /' "$f"
  fi
done

rows=$(psql -tAXc "SELECT COUNT(*) FROM public.tasks WHERE tenant_id='$TENANT'" | tr -d ' ')
counter=$(psql -tAXc "SELECT COALESCE(SUM(total),0) FROM public.usage_counters
  WHERE tenant_id='$TENANT' AND meter_key='tasks.active'
    AND period_start=date_trunc('month',now())" | tr -d ' ')

echo "TASKS  N=$PARALLEL_TASKS limit=$LIMIT_TASKS -> ok=$succ quota_err=$qerr other=$other rows=$rows counter=$counter"

FAIL=0
if [ "$other" -ne 0 ]; then echo "FAIL tasks: unexpected non-quota errors"; FAIL=1; fi
if [ "$rows" -gt "$LIMIT_TASKS" ]; then
  echo "FAIL tasks: RACE — $rows tasks committed past limit $LIMIT_TASKS"; FAIL=1
fi
if [ "$counter" -gt "$LIMIT_TASKS" ]; then
  echo "FAIL tasks: RACE — usage_counters=$counter > limit $LIMIT_TASKS"; FAIL=1
fi
if [ "$succ" -ne "$LIMIT_TASKS" ] || [ "$qerr" -ne $((PARALLEL_TASKS-LIMIT_TASKS)) ]; then
  echo "FAIL tasks: expected $LIMIT_TASKS OK + $((PARALLEL_TASKS-LIMIT_TASKS)) QUOTA_EXCEEDED"
  FAIL=1
fi

# ---------- test B: concurrent upload_document_version -----------------------
# Fire N parallel uploads, one per document, each +DOC_SIZE bytes. The shared
# storage counter is the only contended resource. Limit permits only 3 uploads.
for i in "${!DOC_IDS[@]}"; do
  did="${DOC_IDS[$i]}"; n=$((i+1))
  (
    psql -tAX -v ON_ERROR_STOP=0 -c "
      SELECT set_config('request.jwt.claims', $JWT, false);
      SELECT (public.upload_document_version(
        '$did'::uuid,
        '{\"bucket\":\"docs\",\"path\":\"x\"}'::jsonb,
        'text/plain', $DOC_SIZE, 'v1',
        'conc-v-'||$n||'-'||md5(random()::text), NULL)).id;
    " > "$WORK/doc_$n.out" 2>&1
    echo "__rc=$?" >> "$WORK/doc_$n.out"
  ) &
done
wait

doc_ok=0; doc_qerr=0; doc_other=0
for f in "$WORK"/doc_*.out; do
  if grep -q 'QUOTA_EXCEEDED' "$f"; then
    doc_qerr=$((doc_qerr+1))
  elif grep -q '__rc=0' "$f"; then
    doc_ok=$((doc_ok+1))
  else
    doc_other=$((doc_other+1))
    echo "  unexpected doc output ($f):"; sed 's/^/    /' "$f"
  fi
done

storage=$(psql -tAXc "SELECT COALESCE(SUM(total),0) FROM public.usage_counters
  WHERE tenant_id='$TENANT' AND meter_key='documents.storage_bytes'
    AND period_start=date_trunc('month',now())" | tr -d ' ')
versions=$(psql -tAXc "SELECT COUNT(*) FROM public.document_versions
  WHERE tenant_id='$TENANT' AND version > 1" | tr -d ' ')

expected_ok=$((LIMIT_BYTES / DOC_SIZE))
expected_qerr=$((PARALLEL_DOCS - expected_ok))
echo "DOCS   N=$PARALLEL_DOCS size=$DOC_SIZE limit=$LIMIT_BYTES -> ok=$doc_ok quota_err=$doc_qerr other=$doc_other storage=$storage versions=$versions"

if [ "$doc_other" -ne 0 ]; then echo "FAIL docs: unexpected non-quota errors"; FAIL=1; fi
if [ "$storage" -gt "$LIMIT_BYTES" ]; then
  echo "FAIL docs: RACE — storage counter $storage > limit $LIMIT_BYTES"; FAIL=1
fi
if [ "$doc_ok" -ne "$expected_ok" ] || [ "$doc_qerr" -ne "$expected_qerr" ]; then
  echo "FAIL docs: expected $expected_ok OK + $expected_qerr QUOTA_EXCEEDED"; FAIL=1
fi

if [ "$FAIL" -ne 0 ]; then exit 1; fi
echo "=== PASS 07_concurrent_quota_race ==="