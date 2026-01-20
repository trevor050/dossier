# Identity & Fingerprinting

Dossier is designed for **small-audience** sites where you want to answer questions like:

- “Did the same recruiter come back?”
- “Which sessions probably belong to the same person?”

This doc explains what Dossier does *today* to connect sessions/visitors, why it sometimes links “too well” (VPN/NAT), and how we plan to improve it.

## Terminology

- **Session**: one browsing session (stored in `sessions`, keyed by `sid`)
- **Visitor**: a long-lived entity ID (stored in `visitors`, keyed by `vid`)
- **Signal**: a piece of evidence used to connect sessions/visitors (cookie id, fingerprint id, IP)
- **Cluster**: an *admin-side* grouping of visitors based on shared signals (stored in `visitor_groups`)

## What gets generated client-side

From `src/tracking/telemetry.ts`:

- `sid` (session id): stored in `sessionStorage` (new per browser session)
- `vid` (visitor id): stored in `localStorage` (persists across sessions on that device/browser profile)
- `scid` (session cookie id): stored as a browser cookie (used as a server-side joining signal)
- `fpid` (fingerprint id): from `@fingerprintjs/fingerprintjs` and stored in `localStorage` (optional via `fingerprinting: false`)

Important: **incognito/private browsing** usually creates a fresh storage bucket, so `vid`, `scid`, and `fpid` often reset. However, behavior varies by browser and settings.

## What gets generated server-side

From ingest (`api/collect.ts`):

- `ip` is derived from the request and stored on the session (`sessions.ip`)
- IP history is recorded in `session_ips` (`sid` + `ip` with hit counts)

This means IP can connect sessions even if the client is in private browsing (because the server still sees the IP).

## How linking works today (current behavior)

### 1) Identity graph (probabilistic)

Dossier writes weighted edges into `identity_edges` on ingest (non-bot only) and resolves identity by walking the graph with a confidence threshold.

Signals are modeled as **nodes** like:

- `vid:<vid>`
- `scid:<cookie-id>`
- `fp:<fingerprint-id>`
- `ipua:<ip>|<uaHash>` (IP is never used alone)

Edges have:

- `weight` (0..1) — base strength of that signal relationship
- `decay_lambda` — time-decay rate (older evidence becomes less meaningful)

At query time, each edge uses an *effective weight*:

`effective = weight * exp(-decay_lambda * age_seconds)`

### 2) Evidence combination

When multiple independent signals connect two visitors, Dossier combines evidence using a “noisy-or” model:

`conf' = 1 - (1-conf) * (1-effective)`

This increases confidence as more evidence accumulates.

### 3) “Linked visitors” in the dashboard

The dashboard shows the top related visitors above the configured confidence threshold, plus which signal types contributed (cookie / fingerprint / ip+ua).

## Why VPN + incognito can still link

If a VPN provider assigns you an exit IP that you also used in other sessions (or Dossier test sessions), the system links by **shared IP**.

This is not “over-fingerprinting”. It’s the opposite: it’s a *low-quality* signal that can be strong in low-traffic environments.

In general:

- **IP is powerful but noisy** (VPNs, NAT, carriers, corporate networks)
- **Fingerprint is powerful but can be degraded** (iOS Safari/WebKit reduces entropy)
- **Cookies are powerful but often reset in private browsing**

## Recommended defaults (for small-audience sites)

If you want fewer false links:

- Treat **IP-only** matches as “weak” evidence.
- Prefer links that include **fingerprint_id** and/or **cookie id**.
- Add time windows to IP matches (e.g. “same IP within 24h”) to reduce stale linking.

Current Dossier defaults reflect this:

- IP is never a standalone signal node; it is only used as `ip+ua` and decays quickly.
- Bot sessions are excluded from the identity graph.

## Privacy + ethics

Dossier is **first-party** (your domain, your database). Still, identity linking can be sensitive.

Recommendations:

- Use replay sparingly and keep `maskAllInputs` enabled.
- Set retention (and document it).
- Add clear disclosure if you use fingerprinting / replay.
- Avoid linking across *different sites* by default.
