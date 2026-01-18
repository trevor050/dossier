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

## 3) (Optional) Proxy through your main site

If you want `/api/admin` to live on your main domain, add a rewrite in your site's `vercel.json`:

```json
{
  "rewrites": [
    {
      "source": "/api/:path*",
      "destination": "https://YOUR-DOSSIER-DOMAIN/api/:path*"
    }
  ]
}
```

Then set `VITE_TRACKER_ENDPOINT=/api/collect` in your client app.

## 4) Postgres setup notes

- Vercel Postgres works out of the box.
- `ensureSchema()` runs on ingest and admin access and is idempotent.
