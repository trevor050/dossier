# Dossier

Personal-scale, first-party analytics for low-traffic sites. Built for the "send to a few recruiters and see what they opened" workflow.

## Who it's for

- Portfolio or resume sites shared with a short list of people
- Small teams who want full visibility without a heavy analytics stack
- Founders who want simple, private tracking without third-party scripts

## What you get

- First-party event capture (hover, click, scroll, sections + device context)
- Session timing (active/idle/total)
- Token-protected admin dashboard at `/api/admin`
- Postgres storage with idempotent migrations
- IP enrichment (IPinfo + PTR) with caching and bot filtering
- Vercel Functions ready (no extra backend needed)

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

### 3) Choose your integration style

#### Option A: Same-origin proxy (recommended)

If you want `/api/admin` and `/api/collect` to live on your existing site without replatforming:

1) Add a rewrite in your site's `vercel.json`:

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

2) Set `VITE_TRACKER_ENDPOINT=/api/collect` in your site.

This keeps everything on your main domain and avoids CORS headaches.

#### Option B: Direct cross-origin

If you do not want rewrites, point the client directly at Dossier:

```
VITE_TRACKER_ENDPOINT=https://YOUR-DOSSIER-DOMAIN/api/collect
```

Then add your site domain(s) to `REPORT_ALLOWED_HOSTS` in Dossier.

## Plug-and-play client

Copy `src/tracking/*` into your app and call `initDossier()`.

```ts
import { initDossier } from './tracking';

initDossier();
```

Advanced usage:

```ts
import { initDossier } from './tracking';

initDossier({
  shouldIgnore: () => false,
  installGlobalTracking: true,
});
```

To disable tracking entirely in a specific environment:

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

## Local dev

```bash
npm install
npm run typecheck
vercel dev
```

## License

MIT. See `LICENSE`.
