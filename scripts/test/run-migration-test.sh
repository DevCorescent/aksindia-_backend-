#!/usr/bin/env bash
# Migration test on a throwaway local PostgreSQL — never a real database.
#   1. Build the pre-migration schema (= production before 2026-09-25) with
#      production-shaped data, and show the current API flags what is missing.
#   2. Dry run: must change nothing.
#   3. Apply, then apply again: the second run must skip every step.
#   4. Every pre-existing row must be unchanged; the result must match a fresh
#      schema.sql exactly; verify-schema.mjs must pass.
#   5. The full API regression (login, orders, reviews, recovery, accounts)
#      runs on the migrated database.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
trap 'stop_api; stop_mail_sink; stop_db' EXIT

MIGRATE="node $BACKEND_DIR/scripts/db/run-migration.mjs --db $TEST_DATABASE_URL"
VERIFY="node $BACKEND_DIR/scripts/db/verify-schema.mjs --db $TEST_DATABASE_URL"
SUITE="$BACKEND_DIR/scripts/test/api-regression.mjs"
OUT="$TEST_STATE_DIR/migration"
fail() { echo "✘ $*" >&2; exit 1; }
ok()   { echo "✔ $*"; }

# Public-schema catalog: tables, columns, indexes, constraints, triggers.
catalog() {
  tpsql -At -c "
    SELECT 'table '||table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'
    UNION ALL SELECT 'column '||table_name||'.'||column_name||' '||data_type||' null='||is_nullable||' default='||coalesce(column_default,'')
      FROM information_schema.columns WHERE table_schema='public'
    UNION ALL SELECT 'index '||indexname||': '||indexdef FROM pg_indexes WHERE schemaname='public'
    UNION ALL SELECT 'constraint '||conrelid::regclass||'.'||conname||': '||pg_get_constraintdef(oid)
      FROM pg_constraint WHERE connamespace='public'::regnamespace AND contype <> 'n'
    UNION ALL SELECT 'trigger '||tgrelid::regclass||'.'||tgname FROM pg_trigger WHERE NOT tgisinternal
    ORDER BY 1"
}

# Row count + md5 of every table, over the columns that existed before the
# migration only — so added columns cannot hide a changed value.
save_columns() {
  tpsql -At -F'|' -c "SELECT table_name, string_agg(quote_ident(column_name), ',' ORDER BY ordinal_position)
    FROM information_schema.columns WHERE table_schema='public' GROUP BY 1 ORDER BY 1" >"$OUT/columns"
}
snapshot() {
  while IFS='|' read -r table cols; do
    echo "$table $(tpsql -At -c "SELECT COUNT(*)||' '||coalesce(md5(string_agg(r::text, E'\n' ORDER BY r::text)),'-')
      FROM (SELECT $cols FROM public.$table) r")"
  done <"$OUT/columns"
}

echo "== 1. pre-migration database (production schema before 2026-09-25)"
start_db
mkdir -p "$OUT"
tpsql -f "$BACKEND_DIR/scripts/test/baseline-schema.sql" >/dev/null 2>&1
hash="$(cd "$BACKEND_DIR" && node -e "console.log(require('bcryptjs').hashSync('AdminPass123', 10))")"
tpsql -v hash="$hash" -f "$BACKEND_DIR/scripts/test/fixtures.sql"
tpsql -v hash="$hash" -f "$BACKEND_DIR/scripts/test/legacy-data.sql"
catalog >"$OUT/catalog.before"
save_columns

start_api false
sleep 2
grep -q '\[schema\] MISSING profiles.username' "$TEST_STATE_DIR/api.log" \
  && ok "API start-up reports the missing schema" || fail "API did not report the missing schema"
code=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$TEST_API_URL/auth/signin" -H 'Content-Type: application/json' \
  -d '{"email":"oldcust@test.io","password":"AdminPass123"}')
[[ $code == 200 ]] && ok "existing email login works before migration" || fail "pre-migration email login: HTTP $code"
stop_api
snapshot >"$OUT/data.before"
echo "   $(wc -l <"$OUT/data.before" | tr -d ' ') tables, $(awk '{s+=$2} END {print s}' "$OUT/data.before") rows snapshotted"

echo; echo "== 2. dry run"
$MIGRATE | tee "$OUT/dry-run.log"
[[ "$(catalog)" == "$(cat "$OUT/catalog.before")" ]] && ok "dry run left the schema unchanged" || fail "dry run changed the schema"
[[ "$(snapshot)" == "$(cat "$OUT/data.before")" ]] && ok "dry run left the data unchanged" || fail "dry run changed data"

echo; echo "== 3a. first run (--apply)"
$MIGRATE --apply | tee "$OUT/run1.log"
grep -q '^[1-9][0-9]* applied, ' "$OUT/run1.log" || fail "first run applied nothing"

echo; echo "== 3b. second run (--apply)"
$MIGRATE --apply | tee "$OUT/run2.log"
grep -q '^0 applied, ' "$OUT/run2.log" && ok "second run is a no-op" || fail "second run changed something"

echo; echo "== 4. results"
diff <(snapshot) "$OUT/data.before" >/dev/null && ok "every pre-existing row is unchanged" || { diff <(snapshot) "$OUT/data.before"; fail "existing data changed"; }
[[ "$(tpsql -At -c "SELECT string_agg(kind||':'||attempts, ',' ORDER BY token_hash) FROM password_resets")" == "link:0,link:0" ]] \
  && ok "existing reset tokens read as kind=link, attempts=0" || fail "unexpected password_resets defaults"
[[ "$(tpsql -At -c "SELECT COUNT(*) FROM profiles WHERE username IS NOT NULL")" == 0 ]] \
  && ok "no username was written to any existing account" || fail "existing accounts got usernames"

catalog >"$OUT/catalog.migrated"
tpsql -c "SET client_min_messages = warning; DROP SCHEMA public CASCADE; CREATE SCHEMA public;" >/dev/null
tpsql -f "$BACKEND_DIR/src/db/schema.sql" >/dev/null 2>&1
catalog >"$OUT/catalog.fresh"
diff "$OUT/catalog.migrated" "$OUT/catalog.fresh" && ok "migrated schema == fresh schema.sql ($(wc -l <"$OUT/catalog.fresh" | tr -d ' ') objects)" \
  || fail "migrated schema differs from schema.sql"

# Rebuild the migrated database for the API run (the comparison needed a fresh one).
tpsql -c "SET client_min_messages = warning; DROP SCHEMA public CASCADE; CREATE SCHEMA public;" >/dev/null
tpsql -f "$BACKEND_DIR/scripts/test/baseline-schema.sql" >/dev/null 2>&1
tpsql -v hash="$hash" -f "$BACKEND_DIR/scripts/test/fixtures.sql"
tpsql -v hash="$hash" -f "$BACKEND_DIR/scripts/test/legacy-data.sql"
$MIGRATE --apply >/dev/null
$VERIFY

echo; echo "== 5. API regression on the migrated database"
start_mail_sink
start_api false
! grep -q '\[schema\] MISSING' "$TEST_STATE_DIR/api.log" && ok "API start-up finds the schema complete" || fail "API still reports missing schema"
for acct in oldcust@test.io oldowner@test.io oldprovider@test.io oldagent@test.io admin@test.io; do
  code=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$TEST_API_URL/auth/signin" -H 'Content-Type: application/json' \
    -d "{\"email\":\"$acct\",\"password\":\"AdminPass123\"}")
  [[ $code == 200 ]] && ok "pre-existing account $acct still logs in" || fail "$acct login: HTTP $code"
done
for phase in main accounts; do echo "-- phase: $phase"; PHASE=$phase node "$SUITE"; done
for phase in otp otp-burn; do echo "-- phase: $phase"; start_api true; PHASE=$phase node "$SUITE"; done

USER_ID=$(tpsql -At -c "SELECT username FROM profiles WHERE role='store_owner' AND username LIKE 'storea_%' LIMIT 1")
VERIFY_EMAIL=oldcust@test.io VERIFY_EMAIL_PASSWORD=AdminPass123 VERIFY_USER_ID="$USER_ID" VERIFY_USER_ID_PASSWORD=StorePass123 \
  $VERIFY --api "$TEST_API_URL"
echo; ok "migration test passed"
