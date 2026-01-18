# Client integration

## Vite / SPA

Copy `src/tracking/*` into your app and add:

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

## Next.js / React

Call the init in a client component or `useEffect`:

```ts
useEffect(() => {
  const trackerConfig = getTrackerConfig();
  const telemetry = createTelemetryClient({
    endpoint: trackerConfig.endpoint ?? 'https://dossier.example.com/api/collect',
    persistVisitorId: trackerConfig.persist,
  });
  telemetry.installGlobalTracking();
  telemetry.ensureVisit();
  return () => {
    void telemetry.flush({ useBeacon: true });
  };
}, []);
```

## Events you can send

```ts
telemetry.track('open_overlay', { overlay: 'projects' });
telemetry.track('cta_clicked', { label: 'resume' });
```
