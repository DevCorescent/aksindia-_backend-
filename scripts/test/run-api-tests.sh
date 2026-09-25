#!/usr/bin/env bash
# API regression: builds a throwaway local PostgreSQL + API + SMTP sink, runs
# every phase, tears everything down. Requires PostgreSQL binaries.
#   scripts/test/run-api-tests.sh
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
trap 'stop_api; stop_mail_sink; stop_db' EXIT

SUITE="$BACKEND_DIR/scripts/test/api-regression.mjs"
start_db
migrate_and_seed
start_mail_sink

# Every code the sink delivered must be absent from the API log.
assert_no_codes_in_log() {
  local codes
  codes=$(node -e 'const fs=require("fs");const f=process.argv[1];
    const t=fs.readFileSync(f,"utf8").replace(/=\r?\n/g,"");
    console.log([...t.matchAll(/reset code is (\d{6})/g)].map(m=>m[1]).join("\n"))' "$MAIL_SINK_FILE")
  [[ -n "$codes" ]] || { echo "  ✘ no OTP mail captured" >&2; exit 1; }
  if grep -qF -f <(echo "$codes") "$TEST_STATE_DIR/api.log"; then echo "  ✘ an OTP appears in the API log" >&2; exit 1; fi
  echo "  ✔ no OTP in the API log ($(echo "$codes" | wc -l | tr -d ' ') codes checked)"
}

echo "== phase: flag parsing (PASSWORD_RESET_OTP_ENABLED)"
for pair in "__unset__=false" "=false" "false=false" "FALSE=false" "true=true" " TRUE =true" "yes=false" "1=false"; do
  value="${pair%=*}"; expect="${pair##*=}"
  start_api "$value"
  got=$(curl -s "$TEST_API_URL/auth/recovery-options" | node -pe 'JSON.parse(require("fs").readFileSync(0)).data.otpEnabled')
  label=$([[ $value == __unset__ ]] && echo "(unset)" || echo "\"$value\"")
  [[ $got == "$expect" ]] && echo "  ✔ $label → otpEnabled=$got" || { echo "  ✘ $label → $got, expected $expect" >&2; exit 1; }
  if [[ $value == yes || $value == 1 ]]; then
    grep -q "PASSWORD_RESET_OTP_ENABLED=$value is not \"true\" or \"false\"" "$TEST_STATE_DIR/api.log" \
      && echo "    ✔ start-up warns about the invalid value" || { echo "    ✘ no start-up warning" >&2; exit 1; }
  fi
done

echo "== phase: main (OTP disabled)"
start_api false
PHASE=main node "$SUITE"

echo "== phase: accounts (OTP disabled)"
PHASE=accounts node "$SUITE"

# The recovery endpoints share a 10-requests/15-min limiter, so each OTP phase
# gets a fresh server (the limiter is in-memory).
echo "== phase: otp"
start_api true
PHASE=otp node "$SUITE"
assert_no_codes_in_log

echo "== phase: otp-burn"
start_api true
PHASE=otp-burn node "$SUITE"
assert_no_codes_in_log

echo "== phase: accounts (OTP enabled)"
PHASE=accounts node "$SUITE"
