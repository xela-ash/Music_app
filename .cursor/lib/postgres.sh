#!/usr/bin/env bash
# Shared PostgreSQL helpers for Cloud Agent dev and isolated MVP-001 tests.

ensure_postgresql_packages() {
  if command -v psql >/dev/null 2>&1; then
    return 0
  fi
  sudo apt-get update -qq
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq postgresql postgresql-contrib
}

wait_for_port() {
  local port="$1"
  for _ in $(seq 1 30); do
    if pg_isready -q -h localhost -p "$port" 2>/dev/null; then
      return 0
    fi
    sleep 1
  done
  return 1
}

start_main_cluster() {
  if ! pg_isready -q -h localhost -p 5432 2>/dev/null; then
    if command -v pg_ctlcluster >/dev/null 2>&1; then
      sudo pg_ctlcluster 16 main start
    else
      sudo service postgresql start
    fi
  fi
  wait_for_port 5432
}

ensure_dev_database() {
  sudo -u postgres psql -tc "SELECT 1 FROM pg_roles WHERE rolname='musicapp'" | grep -q 1 \
    || sudo -u postgres psql -c "CREATE USER musicapp WITH PASSWORD 'musicapp';"
  sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname='musicapp'" | grep -q 1 \
    || sudo -u postgres psql -c "CREATE DATABASE musicapp OWNER musicapp;"
  sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE musicapp TO musicapp;" >/dev/null
}

ensure_test_cluster() {
  local test_port="${MUSICAPP_TEST_DB_PORT:-5433}"
  if ! sudo pg_lsclusters 2>/dev/null | awk '{print $1" "$2}' | grep -q "^16 test$"; then
    sudo pg_createcluster 16 test --port="$test_port"
  fi
  if ! pg_isready -q -h localhost -p "$test_port" 2>/dev/null; then
    sudo pg_ctlcluster 16 test start
  fi
  wait_for_port "$test_port"
}

ensure_test_database() {
  local test_port="${MUSICAPP_TEST_DB_PORT:-5433}"
  sudo -u postgres psql -p "$test_port" -tc "SELECT 1 FROM pg_roles WHERE rolname='musicapp'" | grep -q 1 \
    || sudo -u postgres psql -p "$test_port" -c "CREATE USER musicapp WITH PASSWORD 'musicapp';"
  sudo -u postgres psql -p "$test_port" -tc "SELECT 1 FROM pg_database WHERE datname='musicapp_mvp001'" | grep -q 1 \
    || sudo -u postgres psql -p "$test_port" -c "CREATE DATABASE musicapp_mvp001 OWNER musicapp;"
  sudo -u postgres psql -p "$test_port" -c "GRANT ALL PRIVILEGES ON DATABASE musicapp_mvp001 TO musicapp;" >/dev/null
}
