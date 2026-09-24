#!/usr/bin/env bash
# API regression: builds a throwaway local PostgreSQL + API, runs every phase,
# tears everything down. Requires PostgreSQL binaries (initdb/pg_ctl/psql).
#   scripts/test/run-api-tests.sh
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
trap 'stop_api; stop_db' EXIT

SUITE="$BACKEND_DIR/scripts/test/api-regression.mjs"
start_db
migrate_and_seed

echo "== phase: main (OTP disabled)"
start_api false
PHASE=main node "$SUITE"

# The recovery endpoints share a 10-requests/15-min limiter, so each OTP phase
# gets a fresh server (the limiter is in-memory).
echo "== phase: otp"
start_api true
PHASE=otp node "$SUITE"

echo "== phase: otp-burn"
start_api true
PHASE=otp-burn node "$SUITE"
