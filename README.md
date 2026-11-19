# CrediAdapt AI

CrediAdapt is a loan-underwriting workspace built with TanStack Start and FastAPI. It evaluates affordability, risk, policies, and early closure, then stores each authenticated applicant's submission in MongoDB Atlas.

## Lending workflow

The backend and TanStack Start frontend provide:

- Applicant registration, separate applicant/officer sign-in, bcrypt password hashing, and 20-minute access / seven-day httpOnly refresh JWTs.
- Server-enforced roles, per-applicant application access, and cross-site refresh cookies when `COOKIE_SECURE=true`.
- MongoDB-backed users, applications, reviews, notifications, and append-only audit records.
- Officer queue filters, review assignment, decisions, applicant responses, counter-offer acceptance/decline, withdrawal, and status history.
- Applicant notifications and an authorized PDF report generated from the stored assessment.
- Officer analytics, risk model holdout AUC, and a demographic-free risk model.

The existing evaluation response is preserved under each application's `result` field. The model's women-borrower concession remains a visible policy rule; gender is not used as a model feature or in synthetic risk labels. Policy RAG is not loaded by the API, so ChromaDB and sentence-transformers are excluded from the deploy dependency set.

## Prerequisites

- Node.js 20 or newer
- Python 3.11 or newer
- A MongoDB Atlas M0 cluster

## Configure MongoDB Atlas

1. In Atlas, create a database user and copy its connection string.
2. In **Network Access**, add your current development IP and the IP range used by your production host. Atlas will reject requests otherwise.
3. Copy [backend/.env.example](backend/.env.example) to `backend/.env`, then set `MONGODB_URI`, `JWT_SECRET`, and `JWT_REFRESH_SECRET` to real values. Use different long random secrets for the JWT values.
4. Copy [.env.example](.env.example) to `.env` and set `VITE_API_BASE_URL` to the FastAPI server (normally `http://localhost:8000` locally).
5. In Render, set `ALLOWED_ORIGINS` to the exact deployed Vercel origin (for example `https://your-app.vercel.app`) and set `COOKIE_SECURE=true`. For multiple frontend domains, use comma-separated origins without trailing slashes. The refresh cookie requires `SameSite=None; Secure` across Vercel and Render.
6. If PDF generation cannot find a font that includes the rupee symbol, install DejaVu Sans on the backend host or set `CREDIADAPT_PDF_FONT` to its absolute `.ttf` path.
7. In Vercel, set `VITE_API_BASE_URL` to the deployed Render API URL, then redeploy the frontend after changing it.

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

The officer can then use `/officer/login` to access the review queue.

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
- `GET /api/officer/queue` — officer-only; supports status, risk band, date range, and applicant/reference search
- `GET /api/officer/analytics` — officer-only status, risk mix, approval rate, and decision-time metrics
- `GET /api/officer/applications/{id}` — officer-only application and applicant details
- `POST /api/officer/applications/{id}/start-review`
- `POST /api/officer/applications/{id}/decision` — approve, reject, counter-offer, or request information
- `POST /api/applications/{id}/respond` — applicant information response or counter-offer response
- `POST /api/applications/{id}/withdraw`
- `GET /api/applications/{id}/report.pdf` — owner applicant or officer
- `GET /api/notifications` and `POST /api/notifications/{id}/read`
- `GET /api/audit` — officer-only, paginated, optionally filtered by application
- `GET /api/model/metrics` — officer-only holdout ROC AUC and model feature list
- `GET /api/explainability/{id}`
- `GET /api/advisor/{id}`

## Verification

```bash
npm run typecheck
npm run build
python -m unittest discover -s backend/tests -v
```

The backend tests use a MongoDB-shaped in-memory test double for authentication, workflow transitions, access control, and PDF authorization. Use an Atlas development cluster for the full persistence smoke test.

## Project structure

- `src/` — TanStack Start frontend
- `backend/api.py` — FastAPI application and existing underwriting orchestration
- `backend/db.py` — MongoDB client and required indexes
- `backend/auth.py` — JWT/password/role dependencies
- `backend/scripts/create_officer.py` — trusted officer bootstrap command

This frontend is TanStack Start rather than Next.js, so its protected-route equivalent is an authenticated route guard plus server-side authorization on every protected FastAPI endpoint. It does not use Next.js middleware.
