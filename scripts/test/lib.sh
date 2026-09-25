#!/usr/bin/env bash
# Shared helpers for the local regression stack: a throwaway PostgreSQL
# cluster + the API started against it. Nothing here reads .env's DATABASE_URL;
# every connection is forced to 127.0.0.1 on TEST_PG_PORT.
set -euo pipefail

BACKEND_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TEST_PG_PORT="${TEST_PG_PORT:-55432}"
TEST_API_PORT="${TEST_API_PORT:-5055}"
TEST_STATE_DIR="${TEST_STATE_DIR:-${TMPDIR:-/tmp}/askindia-test-stack}"
export TEST_DATABASE_URL="postgres://postgres@127.0.0.1:${TEST_PG_PORT}/askindia_test"
export TEST_API_URL="http://127.0.0.1:${TEST_API_PORT}/api/v1"
# Local SMTP sink (mail-sink.mjs): when running, the API mails into it.
MAIL_SINK_PORT="${MAIL_SINK_PORT:-55025}"
export MAIL_SINK_FILE="$TEST_STATE_DIR/mails.jsonl"

# PostgreSQL binaries: PG_BIN, else PATH, else Homebrew's postgresql@17.
if [[ -z "${PG_BIN:-}" ]]; then
  if command -v initdb >/dev/null 2>&1; then PG_BIN="$(dirname "$(command -v initdb)")"
  else PG_BIN="/opt/homebrew/opt/postgresql@17/bin"; fi
fi
[[ -x "$PG_BIN/initdb" ]] || { echo "PostgreSQL binaries not found — set PG_BIN" >&2; exit 1; }
export PATH="$PG_BIN:$PATH"

tpsql() { psql "$TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -q "$@"; }

start_db() {
  stop_db
  rm -rf "$TEST_STATE_DIR"; mkdir -p "$TEST_STATE_DIR"
  initdb -D "$TEST_STATE_DIR/pg" -U postgres --auth=trust >/dev/null
  # TCP only: Unix socket paths under long TMPDIRs exceed the 103-byte limit.
  pg_ctl -D "$TEST_STATE_DIR/pg" -o "-p $TEST_PG_PORT -k '' -h 127.0.0.1" -l "$TEST_STATE_DIR/pg.log" -w start >/dev/null
  createdb -h 127.0.0.1 -p "$TEST_PG_PORT" -U postgres askindia_test
}

stop_db() {
  [[ -d "$TEST_STATE_DIR/pg" ]] && pg_ctl -D "$TEST_STATE_DIR/pg" -m fast stop >/dev/null 2>&1 || true
}

# Apply schema.sql twice (proves it is re-runnable), with fixtures in between
# so the second run also proves existing rows survive the migration.
migrate_and_seed() {
  tpsql -f "$BACKEND_DIR/src/db/schema.sql" >/dev/null 2>&1
  local hash
  hash="$(cd "$BACKEND_DIR" && node -e "console.log(require('bcryptjs').hashSync('AdminPass123', 10))")"
  tpsql -v hash="$hash" -f "$BACKEND_DIR/scripts/test/fixtures.sql"
  tpsql -f "$BACKEND_DIR/src/db/schema.sql" >/dev/null 2>&1
}

start_mail_sink() {
  stop_mail_sink
  : >"$MAIL_SINK_FILE"
  MAIL_SINK_PORT="$MAIL_SINK_PORT" nohup node "$BACKEND_DIR/scripts/test/mail-sink.mjs" >"$TEST_STATE_DIR/mail-sink.log" 2>&1 &
  echo $! >"$TEST_STATE_DIR/mail-sink.pid"
  for _ in $(seq 1 20); do grep -q listening "$TEST_STATE_DIR/mail-sink.log" 2>/dev/null && return 0; sleep 0.25; done
  echo "mail sink did not start" >&2; exit 1
}

stop_mail_sink() {
  [[ -f "$TEST_STATE_DIR/mail-sink.pid" ]] && { kill "$(cat "$TEST_STATE_DIR/mail-sink.pid")" 2>/dev/null || true; rm -f "$TEST_STATE_DIR/mail-sink.pid"; }
  lsof -ti:"$MAIL_SINK_PORT" 2>/dev/null | xargs kill 2>/dev/null || true
}

# start_api [otp=false|true|<any value>|__unset__] — test-only secrets; payment
# gateway credentials are blanked, and mail goes to the local sink when it runs
# (otherwise SMTP is blanked too), so nothing leaves the machine.
start_api() {
  stop_api
  (
    cd "$BACKEND_DIR"
    export DATABASE_URL="$TEST_DATABASE_URL" PORT="$TEST_API_PORT" NODE_ENV=development
    export JWT_SECRET=regression-test-secret FRONTEND_URL=http://localhost:5173
    export SMTP_HOST= MAIL_FROM= CASHFREE_APP_ID= CASHFREE_SECRET_KEY= CASHFREE_WEBHOOK_SECRET= RAZORPAY_WEBHOOK_SECRET=
    if [[ -f "$TEST_STATE_DIR/mail-sink.pid" ]]; then
      export SMTP_HOST=127.0.0.1 SMTP_PORT="$MAIL_SINK_PORT" SMTP_USER= SMTP_SECURE=false MAIL_FROM=noreply@askindia.test
    fi
    if [[ "${1:-false}" == __unset__ ]]; then unset PASSWORD_RESET_OTP_ENABLED
    else export PASSWORD_RESET_OTP_ENABLED="${1-false}"; fi
    nohup npx ts-node-dev --transpile-only src/server.ts >"$TEST_STATE_DIR/api.log" 2>&1 &
    echo $! >"$TEST_STATE_DIR/api.pid"
  )
  for _ in $(seq 1 60); do
    curl -sf "http://127.0.0.1:${TEST_API_PORT}/health" >/dev/null && return 0
    sleep 1
  done
  echo "API did not start — see $TEST_STATE_DIR/api.log" >&2; exit 1
}

stop_api() {
  if [[ -f "$TEST_STATE_DIR/api.pid" ]]; then
    pkill -P "$(cat "$TEST_STATE_DIR/api.pid")" 2>/dev/null || true
    kill "$(cat "$TEST_STATE_DIR/api.pid")" 2>/dev/null || true
    rm -f "$TEST_STATE_DIR/api.pid"
  fi
  lsof -ti:"$TEST_API_PORT" 2>/dev/null | xargs kill 2>/dev/null || true
}
