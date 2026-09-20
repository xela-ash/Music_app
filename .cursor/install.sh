#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [[ ! -f backend/.env ]]; then
  cp backend/.env.example backend/.env
  if ! grep -q '^JWT_SECRET=.' backend/.env; then
    echo "JWT_SECRET=dev-local-jwt-secret-change-in-production" >> backend/.env
  fi
fi

cd backend
npm ci
cd "$ROOT/frontend"
corepack enable
pnpm install --frozen-lockfile
pnpm rebuild esbuild
