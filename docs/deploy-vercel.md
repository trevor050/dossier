# Deploy to Vercel

## 1) Create a new Vercel project

- Import this repo
- Accept defaults (no framework)

## 2) Set env vars

Required:

- `DATABASE_URL` (or `POSTGRES_URL*`)
- `ADMIN_TOKEN`

Optional:

- `IPINFO_TOKEN`
- `REPORT_ALLOWED_HOSTS`
- `BOT_SCORE_THRESHOLD`

## 3) Postgres setup notes

- Vercel Postgres works out of the box.
- `ensureSchema()` runs on ingest and admin access; it is idempotent.

## 4) CORS / allowlist

Dossier only accepts cross‑origin requests from `REPORT_ALLOWED_HOSTS` or the current deployment host. Add your client app’s domain(s) to `REPORT_ALLOWED_HOSTS`.
