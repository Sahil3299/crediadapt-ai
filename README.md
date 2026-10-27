# CrediAdapt AI

CrediAdapt is a loan-underwriting workspace built with TanStack Start and FastAPI. It evaluates affordability, risk, policies, and early closure, then stores each authenticated applicant's submission in MongoDB Atlas.

## Phase 1: authentication and persistence

Phase 1 is complete. It provides:

- Applicant registration and separate applicant/officer sign-in pages.
- Password hashing with bcrypt; 20-minute JWT access tokens and seven-day httpOnly refresh cookies.
- Server-enforced roles and per-applicant data ownership.
- MongoDB-backed users, applications, and append-only audit entries.
- A persistent `SUBMITTED` application created by `POST /api/recommendations`.
- An officer account seed script. Officer accounts cannot be created through public registration.

The existing evaluation response fields are preserved under each application's `result` field. Policy RAG is not started by the API, so ChromaDB and sentence-transformers are not installed in the deploy dependency set.

## Prerequisites

- Node.js 20 or newer
- Python 3.11 or newer
- A MongoDB Atlas M0 cluster

## Configure MongoDB Atlas

1. In Atlas, create a database user and copy its connection string.
2. In **Network Access**, add your current development IP and the IP range used by your production host. Atlas will reject requests otherwise.
3. Copy [backend/.env.example](backend/.env.example) to `backend/.env`, then set `MONGODB_URI`, `JWT_SECRET`, and `JWT_REFRESH_SECRET` to real values. Use different long random secrets for the JWT values.
4. Copy [.env.example](.env.example) to `.env` and set `VITE_API_BASE_URL` to the FastAPI server (normally `http://localhost:8000` locally).

Never commit either `.env` file.

## Run locally

In one terminal:

```bash
python -m pip install -r backend/requirements.txt
python backend/api.py
```

In another terminal:

```bash
npm install
npm run dev
```

Open the displayed frontend URL (normally `http://localhost:3000` or `http://localhost:8080`). Register at `/login`, submit an assessment from `/applications`, and reload the page to confirm it persists.

## Create the first officer

Run this only from a trusted terminal. The script prompts for the password, so it is not exposed in shell history.

```bash
python backend/scripts/create_officer.py --email officer@example.com --name "Loan Officer"
```

The officer can then use `/officer/login`. The Phase 1 queue confirms officers can read all submitted applications; review transitions and decisions are implemented in Phase 2.

## API summary

Public endpoints:

- `GET /api/health`
- `POST /api/auth/register` — creates an applicant only
- `POST /api/auth/login` — requires `email`, `password`, and `role`
- `POST /api/auth/refresh`
- `POST /api/auth/logout`

Authenticated endpoints:

- `GET /api/auth/me`
- `POST /api/evaluate-loan` — non-persistent compatibility evaluation
- `POST /api/recommendations` — applicant only; evaluates and persists a `SUBMITTED` application
- `GET /api/recommendations/{id}`
- `GET /api/applications`
- `GET /api/officer/queue` — officer only; filtering and review actions arrive in Phase 2
- `GET /api/explainability/{id}`
- `GET /api/advisor/{id}`

## Verification

```bash
npm run typecheck
npm run build
python -m unittest discover -s backend/tests -v
```

The backend test suite uses a MongoDB-shaped in-memory test double for auth and access-control paths; use an Atlas development cluster for the full persistence smoke test.

## Project structure

- `src/` — TanStack Start frontend
- `backend/api.py` — FastAPI application and existing underwriting orchestration
- `backend/db.py` — MongoDB client and required indexes
- `backend/auth.py` — JWT/password/role dependencies
- `backend/scripts/create_officer.py` — trusted officer bootstrap command

This frontend is TanStack Start rather than Next.js, so its protected-route equivalent is an authenticated route guard plus server-side authorization on every protected FastAPI endpoint. It does not use Next.js middleware.
