# Quickstart

## 1) Deploy

Deploy this repo to Vercel. No build output is required because the project is primarily API routes + static admin UI.

## 2) Configure env vars

Required:

- `DATABASE_URL` (or `POSTGRES_URL*`)
- `ADMIN_TOKEN`

Optional:

- `IPINFO_TOKEN`
- `REPORT_ALLOWED_HOSTS` (comma‑separated allowlist)
- `BOT_SCORE_THRESHOLD` (default `6`)

## 3) Wire the client

Copy `src/tracking/*` into your app and add the snippet below. Set `VITE_TRACKER_ENDPOINT` to your Dossier URL.

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

## 4) Open the dashboard

Visit `/api/admin` on your Dossier deployment and paste the `ADMIN_TOKEN`.
