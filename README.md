# Dossier

Personal-scale, first-party analytics for low-traffic sites.

Dossier is built for the "send to a few recruiters and see what they opened" use case. The standard setup is **one Dossier deployment per website** so data, admin tokens, and retention settings stay isolated.

## What you get

- First-party event capture (hover, click, scroll, sections + device context)
- Session timing (active / idle / total)
- Token-protected admin dashboard at `/api/admin`
- Postgres storage with idempotent migrations
- IP enrichment (IPinfo + PTR) with caching and bot filtering
- Vercel Functions ready (no extra backend needed)

## Standard setup (recommended)

**One Dossier per website**.

This is the most common open-source pattern and the easiest to understand:

- each site has its own Dossier deployment
- each site has its own Postgres database
- each site has its own `ADMIN_TOKEN`

If you run multiple websites, deploy multiple Dossier instances.

To create a new instance quickly:

- GitHub: click "Use this template" on the repo
- CLI: `npx degit trevor050/dossier my-dossier`

## 5-minute setup

### 1) Deploy Dossier

Deploy this repo to Vercel.

### 2) Set env vars

Required:

- `DATABASE_URL` (or `POSTGRES_URL*`)
- `ADMIN_TOKEN`

Optional:

- `IPINFO_TOKEN`
- `REPORT_ALLOWED_HOSTS` (comma-separated allowlist)
- `BOT_SCORE_THRESHOLD` (default `6`)

### 3) Integrate with your site

Choose the routing style you want.

#### Option A: Same-origin proxy (recommended)

Keep `/api/admin` and `/api/collect` on your site domain by adding a rewrite:

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

Then set:

```
VITE_TRACKER_ENDPOINT=/api/collect
```

#### Option B: Direct cross-origin

Point your client directly at Dossier:

```
VITE_TRACKER_ENDPOINT=https://YOUR-DOSSIER-DOMAIN/api/collect
```

Add your site domain(s) to `REPORT_ALLOWED_HOSTS`.

## Plug-and-play client

Copy `src/tracking/*` into your app and call `initDossier()`.

```ts
import { initDossier } from './tracking';

initDossier();
```

To disable tracking in an environment:

```
VITE_TRACKER_ENDPOINT=off
```

## Admin dashboard

- Visit `/api/admin`
- Enter `ADMIN_TOKEN`
- Token is stored in `localStorage` + a cookie scoped to `/api/admin`

## Project layout

**Client**

- `src/tracking/config.ts` — config helper
- `src/tracking/telemetry.ts` — event queue + batching
- `src/tracking/index.ts` — `initDossier()` convenience wrapper

**Ingest + admin API (Vercel Functions)**

- `api/collect.ts`
- `api/admin/*`

**Server helpers**

- `server/*`

## Docs

- `docs/quickstart.md`
- `docs/deploy-vercel.md`
- `docs/client.md`
- `docs/api.md`
- `docs/schema.md`
- `docs/security.md`
- `docs/troubleshooting.md`

## Local dev

```bash
npm install
npm run typecheck
vercel dev
```

## License

MIT. See `LICENSE`.
