# Dossier

Personal-scale, first-party analytics (plus optional session replay) for low-traffic sites.

Dossier is built for the "send to a few recruiters and see what they opened" use case.

## What you get

- First-party event capture (hover, click, scroll, sections + device context)
- Session timing (active / idle / total)
- Optional session replay (rrweb)
- Token-protected admin dashboard at `/api/admin`
- Postgres storage with idempotent migrations
- IP enrichment (IPinfo + PTR) with caching and bot filtering
- Vercel Functions ready (no extra backend)

## Install (recommended): single Vercel project

Install Dossier as a package, and keep `/api/*` routes in the same repo as your site/app (no separate Vercel project).

### 1) Install

```bash
npm install @trevor050/dossier
```

Until the npm package is published, you can install from GitHub:

```bash
npm install github:trevor050/dossier
```

### 2) Add API shims (Vercel `api/` routes)

Create these files in your project:

```ts
// api/collect.ts
export { default } from '@trevor050/dossier/api/collect';
```

```ts
// api/replay.ts (optional)
export { default } from '@trevor050/dossier/api/replay';
```

```ts
// api/admin/index.ts
export { default } from '@trevor050/dossier/api/admin/index';
```

Copy the rest of the admin endpoints from `api/admin/*` in this repo (they are all 1-line re-exports).

### 3) Configure env vars

Server (required):

```bash
DATABASE_URL=postgres://...
ADMIN_TOKEN=long-random-secret
```

Server (optional):

```bash
IPINFO_TOKEN=
REPORT_ALLOWED_HOSTS=
BOT_SCORE_THRESHOLD=6
```

Client (Vite):

```bash
VITE_TRACKER_ENDPOINT=/api/collect
VITE_TRACKER_PERSIST=localStorage
```

### 4) Add the client snippet

```ts
import { initDossier } from '@trevor050/dossier/client';

initDossier({
  endpoint: '/api/collect',
  replay: { sampleRate: 0.1 }, // optional (0 disables)
});
```

### 5) Open the dashboard

Visit `/api/admin` and enter `ADMIN_TOKEN`.

## Alternative: standalone Dossier deployment

If you want Dossier deployed separately, deploy this repo to Vercel and proxy it from your site via rewrites.

See `docs/quickstart.md`.

## Docs

- `docs/quickstart.md`
- `docs/client.md`
- `docs/api.md`
- `docs/identity.md`
- `ROADMAP.md`

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
- `docs/events.md`
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
