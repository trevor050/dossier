# Dossier

A friction‑light, first‑party analytics system for low‑traffic, high‑signal sites.

Dossier is designed for the “send to a few recruiters and see what they opened” use case: one deploy, a tiny client snippet, and a clean private dashboard.

## Highlights

- First‑party event capture (hover/click/scroll/sections + device context)
- Session timing (active/idle/total)
- Token‑protected admin dashboard at `/api/admin`
- Postgres storage with idempotent migrations
- IP enrichment (IPinfo + PTR) with caching and bot filtering
- Works with Vercel Functions out of the box

## Project layout

**Client**

- `src/tracking/config.ts` — Vite client config helper
- `src/tracking/telemetry.ts` — event queue + batching + global listeners

**Ingest + admin API (Vercel Functions)**

- `api/collect.ts` — ingest endpoint (writes to Postgres)
- `api/admin/index.ts` — dashboard UI
- `api/admin/auth.ts` — auth check endpoint
- `api/admin/sessions.ts` — sessions list
- `api/admin/session.ts` — session detail (includes events)
- `api/admin/visitors.ts` — visitors list
- `api/admin/status.ts` — configuration status (safe)

**Server helpers**

- `server/schema.ts` — tables + migrations
- `server/db.ts` — Postgres pool
- `server/http.ts` — request helpers / allowlist
- `server/bot.ts` — bot scoring heuristics
- `server/geo.ts` — Vercel geo header parsing
- `server/ipinfo.ts` — IPinfo caching + enrichment
- `server/ptr.ts` — PTR caching + reverse DNS
- `server/admin.ts` — `ADMIN_TOKEN` auth helper

## Quick start (Vercel)

1. Deploy this repo to Vercel.
2. Set the required env vars (see below).
3. In your client app, initialize the telemetry client and point it at your Dossier `/api/collect`.
4. Visit `/api/admin` and enter `ADMIN_TOKEN`.

## Environment variables

**Required**

- `DATABASE_URL` (or `POSTGRES_URL*`)
- `ADMIN_TOKEN`

**Optional**

- `IPINFO_TOKEN` (skipped for bots; cached per IP)
- `REPORT_ALLOWED_HOSTS` (comma‑separated allowlist for Origin/Referer)
- `BOT_SCORE_THRESHOLD` (default: `6`)

## Client integration (Vite)

Install the client files directly or copy `src/tracking/*` into your app.

```ts
import { getTrackerConfig } from './tracking/config';
import { createTelemetryClient } from './tracking/telemetry';

const trackerConfig = getTrackerConfig();
const telemetry = createTelemetryClient({
  endpoint: trackerConfig.endpoint ?? 'https://dossier.example.com/api/collect',
  persistVisitorId: trackerConfig.persist,
});

telemetry.installGlobalTracking();
telemetry.ensureVisit();

window.addEventListener('pagehide', () => {
  void telemetry.flush({ useBeacon: true });
});
```

Recommended env vars:

```
VITE_TRACKER_ENDPOINT=https://dossier.example.com/api/collect
VITE_TRACKER_PERSIST=localStorage
```

## Admin dashboard

- Visit `/api/admin`
- The admin token is stored in `localStorage` + a cookie scoped to `/api/admin`

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
