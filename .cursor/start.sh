#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if ! command -v psql >/dev/null 2>&1; then
  sudo apt-get update -qq
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq postgresql postgresql-contrib
fi

if [[ ! -d backend/node_modules ]] || [[ ! -d frontend/node_modules ]]; then
  ./.cursor/install.sh
fi

if ! pg_isready -q -h localhost -p 5432 2>/dev/null; then
  if command -v pg_ctlcluster >/dev/null 2>&1; then
    sudo pg_ctlcluster 16 main start
  else
    sudo service postgresql start
  fi
fi

for _ in $(seq 1 30); do
  if pg_isready -q -h localhost -p 5432; then
    break
  fi
  sleep 1
done

if ! pg_isready -q -h localhost -p 5432; then
  echo "PostgreSQL did not become ready on port 5432."
  exit 1
fi

sudo -u postgres psql -tc "SELECT 1 FROM pg_roles WHERE rolname='musicapp'" | grep -q 1 \
  || sudo -u postgres psql -c "CREATE USER musicapp WITH PASSWORD 'musicapp';"

sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname='musicapp'" | grep -q 1 \
  || sudo -u postgres psql -c "CREATE DATABASE musicapp OWNER musicapp;"

sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE musicapp TO musicapp;" >/dev/null

cd "$ROOT/backend"
npm run migrate
