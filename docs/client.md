# Client integration

Dossier ships as a package you can import into any Vite/SPA or framework project.

## Plug-and-play

```ts
import { initDossier } from '@trevor050/dossier/client';

initDossier();
```

`initDossier()` will:

- create a telemetry client
- install global tracking
- send the initial visit event
- flush on `pagehide`

## Advanced

```ts
import { initDossier } from '@trevor050/dossier/client';

initDossier({
  endpoint: 'https://YOUR-DOSSIER-DOMAIN/api/collect',
  shouldIgnore: () => false,
  installGlobalTracking: true,
  fingerprinting: true,
  replay: { sampleRate: 0.1, maskAllInputs: true },
});
```

## Manual wiring

```ts
import { getTrackerConfig } from '@trevor050/dossier/client/config';
import { createTelemetryClient } from '@trevor050/dossier/client/telemetry';

const trackerConfig = getTrackerConfig();
const telemetry = createTelemetryClient({
  endpoint: trackerConfig.endpoint ?? 'https://YOUR-DOSSIER-DOMAIN/api/collect',
  persistVisitorId: trackerConfig.persist,
  replaySampleRate: 0.1,
});

telemetry.installGlobalTracking();
telemetry.ensureVisit();

window.addEventListener('pagehide', () => {
  void telemetry.flush({ useBeacon: true });
  void telemetry.flushReplay({ useBeacon: true });
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
