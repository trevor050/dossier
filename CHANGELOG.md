# Changelog

## 0.2.1

Run `npx dossier migrate` after upgrading (adds migration 3).

- Fixed: visits that span several page loads lost data. Each page's summary overwrote the earlier pages' section times and page list, and active time was stored as the largest page's value instead of the total. Summaries are now stored per page load (`session_pages`, latest `seq` wins) and summed when read, so retries, a second pagehide or a late heartbeat can never double count. Existing summaries are carried over by the migration; data already lost by 0.2.0 on multi-page visits cannot be recovered.
- Fixed: a click that also opened an overlay (`click_target` + `open_overlay`) or followed a tracked link (`click_target` + `click_link`) counted twice in a person's clicks and showed twice in the visit timeline. They are now one action; sites that send only one of the event types count as before.
- Tracker: summaries carry `pageview_id`, `seq` and `started_at`; a click on a tracked link sends one `click_target` with the destination instead of two events; the `visit` event includes the path, so the timeline shows which page each page load started on.

## 0.2.0

A rewrite. See [docs/migrating-from-0.1.md](docs/migrating-from-0.1.md) for the upgrade steps.

- Named links: create one per recipient, see whether and how they opened it.
- New dashboard (people, person, visit timeline with replay, map, content, bots, settings), usable on phones.
- Two Vercel Functions instead of a dozen; Web-standard handlers that also run on plain Node (`dossier serve`).
- `dossier` CLI: `init`, `migrate`, `demo`, `serve`, `prune`, `token`.
- Demo mode on an embedded Postgres, no setup needed.
- Explicit, versioned migrations instead of creating tables at runtime.
- Tracker: real active-time measurement, section dwell, `enter()`/`leave()`, drop-in `<script>` tag, no runtime dependencies.
- Privacy: GPC/DNT honored by default, `?dossier=off` opt-out, fingerprinting off by default, replay retention, visitor deletion.
- Security: HttpOnly session cookie instead of a token in localStorage, constant-time comparison, CSP, payload limits, rate limits, per-session caps, no CDN scripts.
- Identity: path confidence multiplies instead of accumulating; IP-only matches no longer group people.
- Removed: the Discord reporter, per-route admin handlers, `client/config` and `client/telemetry` entry points.

## 0.1.0

- Initial open-source release.
