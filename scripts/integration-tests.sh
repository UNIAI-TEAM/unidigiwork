#!/usr/bin/env bash
# Runs Postgres integration tests against the Lovable Cloud database.
# Each test wraps in BEGIN/ROLLBACK so nothing persists.
set -uo pipefail

cd "$(dirname "$0")/.."
TESTS_DIR="tests/integration"
LOG_DIR=".lovable/reports"
mkdir -p "$LOG_DIR"

pass=0; fail=0; failed_names=()
for f in "$TESTS_DIR"/[0-9]*.sql; do
  name="$(basename "$f" .sql)"
  log="$LOG_DIR/itest-$name.log"
  printf '▶ %-40s ' "$name"
  if PGOPTIONS='--client-min-messages=notice' \
     psql -v ON_ERROR_STOP=1 -X -q -f "$f" >"$log" 2>&1; then
    if grep -q "^=== PASS " "$log"; then
      echo "PASS"; pass=$((pass+1))
    else
      echo "FAIL (no PASS marker)"; fail=$((fail+1)); failed_names+=("$name")
    fi
  else
    echo "FAIL"; fail=$((fail+1)); failed_names+=("$name")
    sed -n '1,40p' "$log" | sed 's/^/    /'
  fi
done

echo
echo "Integration tests: $pass passed, $fail failed"
if [ "$fail" -gt 0 ]; then
  echo "Failed:"; printf '  - %s\n' "${failed_names[@]}"
  echo "Logs: $LOG_DIR/itest-*.log"
  exit 1
fi