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

#### Admin (two options)

**Option 1 (simple, more functions):** create `api/admin/*` files that re-export the matching handler from Dossier.

This is easiest, but some plans have a strict function-count limit.

**Option 2 (Hobby-plan friendly):** collapse admin into a single function:

1) Create `api/admin.ts`:

```ts
import adminIndex from '@trevor050/dossier/api/admin/index';
import adminAuth from '@trevor050/dossier/api/admin/auth';
import adminBots from '@trevor050/dossier/api/admin/bots';
import adminMap from '@trevor050/dossier/api/admin/map';
import adminOverview from '@trevor050/dossier/api/admin/overview';
import adminReplay from '@trevor050/dossier/api/admin/replay';
import adminSession from '@trevor050/dossier/api/admin/session';
import adminSessions from '@trevor050/dossier/api/admin/sessions';
import adminStatus from '@trevor050/dossier/api/admin/status';
import adminVisitor from '@trevor050/dossier/api/admin/visitor';
import adminVisitors from '@trevor050/dossier/api/admin/visitors';

const routes: Record<string, (req: any, res: any) => any> = {
  '': adminIndex,
  index: adminIndex,
  auth: adminAuth,
  bots: adminBots,
  map: adminMap,
  overview: adminOverview,
  replay: adminReplay,
  session: adminSession,
  sessions: adminSessions,
  status: adminStatus,
  visitor: adminVisitor,
  visitors: adminVisitors,
};

export default function handler(req: any, res: any) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  let route = (url.searchParams.get('route') || '').trim();
  route = route.replace(/^\\/+/, '').replace(/\\/+$/, '');
  if (route.startsWith('admin/')) route = route.slice('admin/'.length);
  const fn = routes[route];
  if (!fn) {
    res.statusCode = 404;
    res.setHeader('content-type', 'text/plain; charset=utf-8');
    res.end('Not Found');
    return;
  }
  return fn(req, res);
}
```

2) Add a rewrite in your `vercel.json`:

```json
{
  "rewrites": [
    { "source": "/api/admin/:path*", "destination": "/api/admin?route=:path*" }
  ]
}
```

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
