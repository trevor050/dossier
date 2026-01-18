# Events and tracking

Dossier collects two kinds of events:

1) **Automatic events** from the global tracker
2) **Custom events** you emit via `telemetry.track()`

## Automatic events

These are emitted by the default client:

- `visit` — sent once per session
- `focus` / `blur`
- `visibility` — document visibility changes
- `click_link` — anchor clicks (host + path)
- `click_target` — elements with `data-track` / `data-track-group`
- `idle_start` / `idle_end` — idle detection (default 30s)
- `js_error` — uncaught JS errors
- `unhandledrejection`
- `rage_click` — rapid repeated clicks on the same element
- `perf_nav` — navigation timing summary
- `fingerprint_ready` — fingerprint id resolved

## Custom events

Call `telemetry.track()` anywhere in your app:

```ts
telemetry.track('cta_clicked', { label: 'resume' });
telemetry.track('open_overlay', { overlay: 'projects' });
```

## Click tracking with data attributes

Add `data-track` to any element and it will emit `click_target`:

```html
<button data-track="resume">Download resume</button>
```

Optional grouping:

```html
<button data-track="apply" data-track-group="cta">Apply</button>
```

## Fingerprinting

The client uses `@fingerprintjs/fingerprintjs` to generate a stable id (`fpid`).
It is stored in `localStorage` and included in ingest payloads for linking sessions.
