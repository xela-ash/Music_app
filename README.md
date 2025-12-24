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

## Local Development

### Start frontend
```bash
cd frontend
pnpm dev
```

### Start backend
```bash
cd backend
node Index.js
✔️ Result:
- “Start backend” = heading
- Commands = dark copyable box

---

### 2️⃣ Add **Start database**

```md
### Start database
```bash
docker compose up -d

---

### 3️⃣ Add **Status** (THIS IS NOT A CODE BLOCK)

```md
## Status
- Frontend ↔ Backend connected
- PostgreSQL running locally
- No business logic yet (intentional)

This repo represents the baseline MVP skeleton.