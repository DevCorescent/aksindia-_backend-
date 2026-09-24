#!/usr/bin/env bash
# Start the throwaway DB + API (OTP disabled) and leave them running, e.g. for
# the frontend browser regression. Stop with stop-test-stack.sh.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
start_db
migrate_and_seed
start_api false
echo "TEST_API_URL=$TEST_API_URL"
echo "TEST_DATABASE_URL=$TEST_DATABASE_URL"
