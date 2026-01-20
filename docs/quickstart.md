# Quickstart

This guide covers the two supported setups:

- Package install into an existing app (single Vercel project)
- Standalone Dossier deployment (optional)

## Option A (recommended): install as a package

### 1) Install

```bash
npm install @trevor050/dossier
```

Until the npm package is published, you can install from GitHub:

```bash
npm install github:trevor050/dossier
```

### 2) Add Vercel `api/` shims

Create these files in your app:

```ts
// api/collect.ts
export { default } from '@trevor050/dossier/api/collect';
```

```ts
// api/admin/index.ts
export { default } from '@trevor050/dossier/api/admin/index';
```

Add the rest of the admin endpoints by copying the 1-line re-exports from this repo’s `api/admin/*`.

Replay is optional:

```ts
// api/replay.ts
export { default } from '@trevor050/dossier/api/replay';
```

### 3) Configure env vars

Server (required):

```bash
DATABASE_URL=postgres://...
ADMIN_TOKEN=long-random-secret
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
  replay: { sampleRate: 0.1 }, // optional
});
```

### 5) Open the dashboard

Visit `/api/admin` and enter `ADMIN_TOKEN`.

## Option B: standalone Dossier deployment

If you want Dossier deployed separately, deploy this repo to Vercel and proxy it from your site with a rewrite:

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

Then set `VITE_TRACKER_ENDPOINT=/api/collect`.

If you use direct cross-origin instead, add your site domain(s) to `REPORT_ALLOWED_HOSTS`.
