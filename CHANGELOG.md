# Changelog

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
