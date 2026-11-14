#!/usr/bin/env bash
# Applies the migration to a throwaway local PostgreSQL 16 cluster (with stand-ins for Supabase's
# auth/storage schemas) and runs the RLS / concurrency assertions.
set -euo pipefail
PGBIN=${PGBIN:-/usr/lib/postgresql/16/bin}
DIR=$(mktemp -d)
PORT=${PORT:-54329}
HERE=$(cd "$(dirname "$0")" && pwd)
RUNAS=""
cleanup() { $RUNAS "$PGBIN/pg_ctl" -D "$DIR/data" stop -m immediate >/dev/null 2>&1 || true; rm -rf "$DIR"; }
trap cleanup EXIT
if [ "$(id -u)" = "0" ]; then chown -R postgres "$DIR"; RUNAS="runuser -u postgres --"; fi
$RUNAS "$PGBIN/initdb" -D "$DIR/data" -U postgres >/dev/null
$RUNAS "$PGBIN/pg_ctl" -D "$DIR/data" -o "-p $PORT -k $DIR" -l "$DIR/log" start >/dev/null
for i in $(seq 1 30); do $RUNAS psql -h "$DIR" -p "$PORT" -U postgres -c 'select 1' >/dev/null 2>&1 && break; sleep 0.2; done
q() { $RUNAS psql -h "$DIR" -p "$PORT" -U postgres -v ON_ERROR_STOP=1 -q "$@"; }
q -f "$HERE/supabase_stubs.sql"
q -f "$HERE/../migrations/0001_omnidesign_sync.sql" 2>/dev/null
q -f "$HERE/../migrations/0001_omnidesign_sync.sql" 2>/dev/null   # idempotent re-run
q -f "$HERE/rls_test.sql"
