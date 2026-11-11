# Upgrading from 0.1

0.2 is a rewrite. Your data carries over; the integration code changes.

## Database

Run once, against the production database, before or right after deploying 0.2:

```bash
DATABASE_URL=postgres://... npx dossier migrate
```

Migration 1 adopts the tables 0.1 created (everything is `IF NOT EXISTS`), migration 2 adds the new columns and the `links` table. Old sessions keep their `ref_tag`; create a link with the same slug and those visits attach to it. 0.1 overlay dwell (`summary.overlays`) is shown alongside the new section timing.

The 0.1 runtime created tables on demand. 0.2 does not; until you migrate, the collector answers 503 and the dashboard tells you to run the command.

## API routes

Replace the old per-route admin functions and router with:

```ts
// api/collect.ts
export { default } from '@trevor050/dossier/vercel/collect';
```

```ts
// api/admin.ts
export { default } from '@trevor050/dossier/vercel/admin';
```

Then:

- Delete `api/replay.ts`. Replay now posts to `/api/collect?kind=replay`. (If an old tracker is still cached somewhere, `@trevor050/dossier/vercel/replay` exists as a compatibility shim.)
- Delete `api/report.ts`. The Discord reporter was removed.
- Remove the `/api/admin/:path*` → `/api/admin?route=:path*` rewrite from `vercel.json`. The dashboard uses query strings on `/api/admin`.

## Environment

- `ADMIN_TOKEN` still works, but it must now be at least 16 characters. `DOSSIER_ADMIN_TOKEN` is the new name.
- `REPORT_ALLOWED_HOSTS` still works; `DOSSIER_ALLOWED_HOSTS` is the new name. Localhost origins are no longer accepted in production.
- `IPINFO_TOKEN` now defaults to the free IPinfo Lite API (country + network). Set `IPINFO_API=standard` if you have a paid plan and want city-level data.
- The bot view no longer calls ipwho.is on its own. Set `DOSSIER_IPWHOIS=1` if you want it.

## Client

`@trevor050/dossier/client/config` and `@trevor050/dossier/client/telemetry` are gone. Use `initDossier`, which returns a no-op handle when tracking is off, so the hand-written `noopTelemetry` object isn't needed:

```ts
import { initDossier } from '@trevor050/dossier/client';

const dossier = initDossier({
  ignore: () => !import.meta.env.PROD || import.meta.env.VITE_TRACKER_ENDPOINT === 'off',
});
```

| 0.1 | 0.2 |
| --- | --- |
| `createTelemetryClient(...)` + `installGlobalTracking()` + `ensureVisit()` | `initDossier(options)` |
| `telemetry.track(type, data)` | `dossier.track(type, data)` (unchanged) |
| Manual overlay timing + `flush({ summary: buildTimingSummary({ overlays }) })` on `pagehide` | `dossier.enter(key)` when it opens, `dossier.leave(key)` when it closes. Summaries are sent automatically. |
| `shouldIgnore` | `ignore` |
| `fingerprinting` (default on) | `fingerprint` (default **off**) |
| `replay: { sampleRate }` | `replay: { sampleRate }` or `replay: 0.25` |
| `?ref=` | `?to=` (`?ref=` still read) |
| app-specific `?internal=1` | `?dossier=off` built in (or keep yours via `ignore`) |

Visitors keep their identity: 0.2 reads the 0.1 `visit_vid` localStorage key.

Behavior changes worth knowing:

- Browsers sending **Global Privacy Control or Do Not Track are not tracked** by default. Brave sends GPC out of the box. `respectPrivacySignals: false` turns this off; the README explains why the default is on.
- Active time now stops while the tab is hidden and after 30 seconds without activity, so numbers will be lower (and closer to the truth) than 0.1's.
