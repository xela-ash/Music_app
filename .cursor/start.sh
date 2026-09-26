#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# shellcheck source=/dev/null
source "$ROOT/.cursor/lib/postgres.sh"

if [[ ! -d backend/node_modules ]] || [[ ! -d frontend/node_modules ]]; then
  ./.cursor/install.sh
fi

ensure_postgresql_packages
start_main_cluster
ensure_dev_database

cd "$ROOT/backend"
npm run migrate
