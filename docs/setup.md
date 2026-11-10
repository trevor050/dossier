# Setup and configuration

The short version is in the [README](../README.md#set-it-up-for-real-about-ten-minutes). This page has the details.

## Vercel (recommended)

```bash
npm install @trevor050/dossier     # or github:trevor050/dossier until it's on npm
npx dossier init                   # writes api/collect.ts and api/admin.ts
```

The two files are one-line re-exports:

```ts
// api/collect.ts
export { default } from '@trevor050/dossier/vercel/collect';
```

```ts
// api/admin.ts
export { default } from '@trevor050/dossier/vercel/admin';
```

No rewrites are needed: the dashboard talks to its API through query strings on `/api/admin`, and replay chunks go to `/api/collect?kind=replay`.

Set the environment variables in the Vercel project, put the same `DATABASE_URL` in a local `.env`, and run `npx dossier migrate`. Run it again after upgrading Dossier; it only applies what's new.

## Anywhere else

```bash
DATABASE_URL=postgres://... DOSSIER_ADMIN_TOKEN=... npx dossier serve --port 8787
```

This serves `/api/collect` and `/api/admin` from a plain Node server. Put it behind your own reverse proxy on the same domain as your site, and add `--trust-proxy` so client IPs come from `X-Forwarded-For` (without it, the socket address is used, which is right only when nothing sits in front).

For other runtimes, `@trevor050/dossier/server` exports `createCollectHandler()` and `createAdminHandler()`, both `(Request) => Promise<Response>`, plus `toNodeListener()` for Node's `http` module.

## Database notes

- Postgres 14 or newer (CI tests 16, local verification used 14). Neon, Supabase, RDS, a box under your desk.
- On serverless, use your provider's **pooled** connection string. Dossier keeps at most 3 connections per function instance (`DOSSIER_DB_POOL_MAX`).
- TLS certificates are verified. If your provider uses a certificate Node doesn't trust and you accept that risk, set `DOSSIER_DB_SSL=no-verify`.
- Upgrading from Dossier 0.1? `npx dossier migrate` adopts the existing tables in place. See [migrating-from-0.1.md](migrating-from-0.1.md).

## Environment variables

| Variable | Default | What it does |
| --- | --- | --- |
| `DATABASE_URL` | | Postgres connection string. `DOSSIER_DATABASE_URL`, `POSTGRES_URL` and `POSTGRES_PRISMA_URL` are also read. |
| `DOSSIER_ADMIN_TOKEN` | | Dashboard password, at least 16 characters. `ADMIN_TOKEN` also works. Changing it signs everyone out. |
| `DOSSIER_ALLOWED_HOSTS` | | Comma-separated hosts allowed to post events cross-origin, e.g. `www.example.com`. Same-origin always works. (`REPORT_ALLOWED_HOSTS` from 0.1 is still read.) |
| `DOSSIER_ALLOW_LOCALHOST` | on outside production | Accept events from `localhost` pages. Off when `NODE_ENV` or `VERCEL_ENV` is `production`. |
| `IPINFO_TOKEN` | | Enables IPinfo lookups. |
| `IPINFO_API` | `lite` | `standard` for paid IPinfo plans (city, coordinates). |
| `DOSSIER_IPWHOIS` | off | `1` enables ipwho.is lookups. |
| `DOSSIER_PTR` | on | `0` disables reverse DNS lookups. |
| `BOT_SCORE_THRESHOLD` | `6` | Score at which a visit counts as a bot. |
| `DOSSIER_LINK_THRESHOLD` | `0.5` | Confidence needed to group two visitor ids into one person. |
| `DOSSIER_REPLAY_MAX_MB` | `5` | Replay storage budget per session. |
| `DOSSIER_MAX_EVENTS_PER_SESSION` | `5000` | Events stored per session. |
| `DOSSIER_DB_POOL_MAX` | `3` | Postgres connections per instance. |
| `DOSSIER_DB_SSL` | | `no-verify` to skip TLS certificate checks. |

## The snippet

```html
<script defer src="/api/collect"></script>
```

The collector serves its own tracker on `GET`, so the script always matches the server. Options are data attributes:

| Attribute | Example | Meaning |
| --- | --- | --- |
| `data-replay` | `0.25` | Record this fraction of sessions. |
| `data-fingerprint` | `true` | Turn on FingerprintJS (open source) visitor ids. |
| `data-sections` | `.panel` | CSS selector for sections to time, or `false`. |
| `data-link-param` | `to,ref` | Query parameters that carry link tags. |
| `data-respect-privacy-signals` | `false` | Track browsers that send GPC/DNT. Think twice. |
| `data-persist` | `cookie` | Keep the visitor id in a cookie instead of localStorage. |

The handle is available as `window.dossier` (`track`, `enter`, `leave`, `flush`, `optOut`, `optIn`).

## Client options

With a bundler, `initDossier()` from `@trevor050/dossier/client` takes:

```ts
initDossier({
  endpoint: '/api/collect',            // collector URL
  ignore: () => import.meta.env.DEV,   // or a boolean
  respectPrivacySignals: true,         // skip GPC / DNT browsers
  linkParam: ['to', 'ref'],            // link tag parameters
  stripParams: true,                   // remove ?to= and ?dossier= from the address bar
  sections: '[data-section], section[id]', // or false
  replay: { sampleRate: 0.25, maskAllInputs: true, maskTextSelector: '[data-dossier-mask]', blockSelector: '[data-dossier-block]', recordCanvas: false },
  fingerprint: false,
  idleAfterMs: 30_000,
  persist: 'localStorage',
});
```

It returns `{ enabled, track, enter, leave, flush, optOut, stop }`. When tracking is disabled (ignored, opted out, GPC/DNT, or server-side rendering) you get a no-op handle with the same shape, so call sites don't need guards.

`optOut()`, `optIn()` and `isOptedOut()` are also exported on their own, e.g. for a "don't track me" toggle on your privacy page.

### What gets sent automatically

| Event | When |
| --- | --- |
| `visit` | Once per session, with the page title |
| `section_view` | First time a section is in view while the visitor is active |
| `section_enter` | `dossier.enter(key)` |
| `scroll_depth` | At 25 / 50 / 75 / 100% |
| `click_target` | Click on a `[data-track]` element |
| `hover` | Pointer over a `[data-track]` element for at least 600 ms |
| `click_link` | Click on any link (host and path only) |
| `pageview` | Client-side navigation (`pushState`, `popstate`) |
| `js_error` | Uncaught errors and unhandled rejections (message only) |
| `perf` | Time to first byte and load time |

Plus a summary (active, idle and total seconds, interactions, time per section, pages, max scroll) sent when the tab is hidden, when the page is closed, and every 30 seconds while active.

A session ends after 30 minutes without activity or when the tab is closed.

## Limits and abuse handling

- Request bodies: 64 KB for events, 1 MB for a replay chunk.
- 200 events per request, 5,000 per session; 5 MB of replay per session. When the replay budget is spent the collector answers 429 and the tracker stops recording.
- 120 requests per minute per IP, per function instance. On serverless each instance has its own counter, so this is a brake, not a wall.
- The origin check stops other websites from posting into your database through visitors' browsers. It can't stop someone with `curl`, which is why everything is validated, bounded and bot-scored.

## Troubleshooting

**Dashboard says "No database configured" or "Dossier tables are missing".** Set `DATABASE_URL` in the deployment, run `npx dossier migrate` against the same database, redeploy.

**Login says the token is too short.** It needs 16+ characters. `npx dossier token` prints a good one.

**Nothing shows up.** Open your site, then the browser's network tab: you should see `POST /api/collect` returning 204. A 403 means the page's origin isn't the collector's host; add it to `DOSSIER_ALLOWED_HOSTS`. Also check you aren't sending GPC (Brave does by default) and haven't opted out with `?dossier=off`.

**Everything I do shows up under Bots.** Headless browsers and automation tools are filtered on purpose. Use a normal browser, or click "Not a bot".

**No locations.** Off Vercel there are no geo headers; enable an enrichment provider or live without the map.
