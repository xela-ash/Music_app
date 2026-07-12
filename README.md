# MusicApp 1738 — MVP Skeleton

This repository contains a clean, local-first MVP architecture intended for rapid prototyping,
patent documentation, and handoff to an engineering team.

## Architecture

```
musicapp_1738_sep/
├── frontend/   # React (Vite + TypeScript)
├── backend/    # Express (Node.js)
├── docker-compose.yml  # PostgreSQL (Docker)
```

### Frontend
- Vite + React + TypeScript
- Runs on http://localhost:5173
- Fetches data from backend API

### Backend
- Node.js + Express
- Runs on http://localhost:4000
- CORS enabled for local development

### Database
- PostgreSQL 16
- Runs in Docker
- Exposed on port 5432
- Persistent volume enabled
- Schema applied via the migration runner in `backend/db/`

## Prerequisites

- Docker Desktop must be installed **and running**
- Node.js (v20+) and npm
- pnpm (for the frontend)

## Local Development

### 1. Start the database

```bash
docker compose up -d
```

### 2. Configure the backend environment

```bash
cd backend
cp .env.example .env
npm install
```

The defaults in `.env.example` already match the credentials in `docker-compose.yml`, so this
works out of the box for local development.

### 3. Apply database migrations

```bash
npm run migrate
```

This runs the SQL files in `backend/db/` in filename order and records which ones have already
been applied, so it's safe to run again after pulling new migrations.

### 4. Start the backend

```bash
npm start
```

Use `npm run dev` instead for auto-restart on file changes.

### 5. Start the frontend

```bash
cd frontend
pnpm install
pnpm dev
```

## Health checks

```bash
curl http://localhost:4000/
curl http://localhost:4000/db-health
```

Both should return a JSON success response once the backend is running and the database is
migrated.

## Ports

| Service    | Port |
|------------|------|
| Frontend   | 5173 |
| Backend    | 4000 |
| PostgreSQL | 5432 |

## Status

- Frontend ↔ Backend connected
- PostgreSQL running locally with migrations tracked in `schema_migrations`
- No business logic beyond signup yet (intentional)

This repo represents the baseline MVP skeleton.
