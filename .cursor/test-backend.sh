#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# shellcheck source=/dev/null
source "$ROOT/.cursor/lib/postgres.sh"

export MUSICAPP_TEST_DB_PORT="${MUSICAPP_TEST_DB_PORT:-5433}"
export DB_HOST="${DB_HOST:-localhost}"
export DB_PORT="$MUSICAPP_TEST_DB_PORT"
export DB_USER="${DB_USER:-musicapp}"
export DB_PASSWORD="${DB_PASSWORD:-musicapp}"
export DB_NAME="musicapp_mvp001"
export JWT_SECRET="${JWT_SECRET:-cloud-mvp001-test-jwt-secret}"

if [[ "$DB_PORT" == "5432" ]]; then
  echo "Refusing to run backend tests on shared port 5432."
  exit 1
fi

if [[ "$DB_NAME" != "musicapp_mvp001" ]]; then
  echo "Refusing to run backend tests: DB_NAME must be musicapp_mvp001."
  exit 1
fi

ensure_postgresql_packages
ensure_test_cluster
ensure_test_database

cd "$ROOT/backend"
DB_HOST="$DB_HOST" DB_PORT="$DB_PORT" DB_USER="$DB_USER" DB_PASSWORD="$DB_PASSWORD" DB_NAME="$DB_NAME" npm run migrate
DB_HOST="$DB_HOST" DB_PORT="$DB_PORT" DB_USER="$DB_USER" DB_PASSWORD="$DB_PASSWORD" DB_NAME="$DB_NAME" JWT_SECRET="$JWT_SECRET" npm test
