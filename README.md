# MusicApp 1738

A two-sided marketplace for fixed-price, milestone-based music work (INR, India-first). Buyers commission Sellers, and the agreed terms are frozen as immutable snapshots. Funds are held in escrow and released milestone by milestone.

**Start here: [`docs/TECHNICAL_HANDOVER.md`](docs/TECHNICAL_HANDOVER.md).** It covers what is built, how to run and test it, the external providers, security considerations, and open work. Contributors and coding agents must also follow [`AGENTS.md`](AGENTS.md).

## Status

Pre-production MVP build, **not production-ready**. 21 of the 52 planned work items are merged. The backend covers:

- accounts, roles, and discovery;
- project negotiation with immutable term snapshots;
- the milestone state machine;
- escrow creation, an append-only ledger, and internal refunds;
- messaging and in-app notifications.

Deliverables, release, payout, disputes, and ratings are not built yet. Live status is in [`docs/19-implementation-planning/autonomous-build-status.md`](docs/19-implementation-planning/autonomous-build-status.md).

## Architecture

```
frontend/            React 19 + TypeScript + Vite (pnpm)        http://localhost:5173
backend/             Node.js + Express 5 + pg, raw SQL (npm)     http://localhost:4000
backend/db/          PostgreSQL 16 migrations + runner (migrate.js)
docker-compose.yml   Local PostgreSQL 16                         localhost:5432
docs/                Governance, canonical specifications, plan, engineering records
```

## Local development

Prerequisites: Docker, Node.js 20+ (CI uses 22.14.0), npm, and pnpm.

```bash
docker compose up -d                  # PostgreSQL on 5432

cd backend
cp .env.example .env                  # set JWT_SECRET to any non-empty local value
npm ci
npm run migrate                       # applies backend/db/*.sql in order; safe to re-run
npm run dev                           # http://localhost:4000

cd ../frontend
pnpm install --frozen-lockfile
pnpm dev                              # http://localhost:5173
```

Health checks: `curl http://localhost:4000/` and `curl http://localhost:4000/db-health`.

## Tests

- **Backend:** runs only against an isolated database named `musicapp_mvp001` on a port other than 5432. The guard refuses anything else, because the fixture truncates every table. See [handover §6](docs/TECHNICAL_HANDOVER.md#6-testing) for the Docker command, or use `./.cursor/test-backend.sh` in the Cursor Cloud image.
- **Frontend:** `cd frontend && pnpm test && pnpm lint && pnpm build`.

## Ports

| Service | Port |
|---|---|
| Frontend | 5173 |
| Backend | 4000 |
| PostgreSQL (development) | 5432 |
| PostgreSQL (isolated tests) | 5433 |
