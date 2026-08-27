#!/usr/bin/env bash
# E2E tamper Work Product trên API thật. Cần WPT_TENANT, WPT_WS, WPT_TASK (task đã gán nhân sự AI).
set -euo pipefail
cd "$(dirname "$0")/../../.."
exec bun tests/runtime/wp-tamper-e2e/probe.mjs
