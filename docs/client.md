# Client integration

Dossier ships as plain TypeScript utilities you can copy into any Vite/SPA or framework project.

## Recommended (plug-and-play)

```ts
import { initDossier } from './tracking';

initDossier();
```

`initDossier()` will:

- create a telemetry client
- install global tracking
- send the initial visit event
- flush on `pagehide`

## Advanced

```ts
import { initDossier } from './tracking';

initDossier({
  endpoint: 'https://YOUR-DOSSIER-DOMAIN/api/collect',
  shouldIgnore: () => false,
  installGlobalTracking: true,
});
```

## Manual wiring

```ts
import { getTrackerConfig } from './tracking/config';
import { createTelemetryClient } from './tracking/telemetry';

const trackerConfig = getTrackerConfig();
const telemetry = createTelemetryClient({
  endpoint: trackerConfig.endpoint ?? 'https://YOUR-DOSSIER-DOMAIN/api/collect',
  persistVisitorId: trackerConfig.persist,
});

telemetry.installGlobalTracking();
telemetry.ensureVisit();

window.addEventListener('pagehide', () => {
  void telemetry.flush({ useBeacon: true });
});
```

## Env vars

```
VITE_TRACKER_ENDPOINT=https://YOUR-DOSSIER-DOMAIN/api/collect
VITE_TRACKER_PERSIST=localStorage
```

To disable tracking:

```
VITE_TRACKER_ENDPOINT=off
```
