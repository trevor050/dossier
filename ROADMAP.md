# Roadmap

This roadmap focuses on making Dossier *better at identity resolution* for low-traffic sites, without turning it into “creepy cross-site tracking”.

## Identity resolution (highest priority)

### Status (what exists today)

Implemented:

- Weighted, time-decaying identity graph (`identity_edges`)
- Probabilistic traversal with a confidence threshold (recursive CTE)
- Bot-safe graph ingestion (bots excluded from identity edges by default)

Not implemented yet:

- Enterprise explainability (edge-level “why” with timestamps and weights)
- Graph hygiene tooling (merge/split, overrides, auditing)

### 1) Confidence scoring + explainability

Current state: **implemented (v0)**.

- Confidence is computed from decayed edge weights (“noisy-or” combination).
- Admin UI shows confidence and contributing signal types (cookie / fingerprint / ip+ua).

Next:

- Return per-edge explanations from the query (top contributing paths)
- Admin UI “Why linked?” panel (signals + last seen + effective weight)
- Filters: “only high confidence”, “exclude ip-only”, “limit to last N days”

### 2) Make IP a *weak* signal by default

Current state: **implemented (v0)**.

- IP is not a standalone node. It is only used as `ip+ua`, has low weight, and decays quickly (hour-scale).
- This prevents VPN/NAT from creating strong long-lived identity merges.

Next:

- Penalize known datacenter/VPN ASNs for linking (requires ASN lookup from cached IP enrichment)
- Add “temporal proximity” as an explicit feature (same ip+ua within < 1 hour vs. 1 day)
- Add “carrier/mobile ASN” penalty to reduce cafe/campus false positives

### 3) Stable-but-scoped “first-party device key” (optional)

For sites that want stronger linking without FingerprintJS:

- Generate a **site-scoped** device key on first visit and store it (cookie + localStorage)
- Rotate / reset on demand
- Never share across different domains

### 4) Multiple “identity buckets” instead of one global cluster

Current state: **not implemented**.

Planned:

- Maintain separate buckets:
  - cookie cluster
  - fingerprint cluster
  - IP cluster (weak)
- Compute “person clusters” by graph traversal + scoring, not by one hash

## Fingerprinting improvements

### 5) Make fingerprinting explicitly opt-in + configurable

Current state: **partially implemented**.

- Client supports `fingerprinting: false`.

Next:

- Provider interface + explicit “what gets collected” docs
- Default posture decision (project-level config)

### 6) Fingerprint stability diagnostics

Add dashboard tooling:

- Show fingerprint churn rate per visitor
- Flag “unstable fingerprints” (common on iOS/private mode)

## Replay (session playback)

### 7) Replay storage + privacy hardening

- Configurable sampling + size limits
- Server-side retention for replay chunks separate from sessions
- Better PII masking defaults + allowlist/denylist of selectors

### 8) Replay UX

- Search within session timeline and jump replay to timestamp
- “Start from first interaction” and “skip idle”

## Bot detection

### 9) Separate bot classification from identity linking

Current state: **partially implemented**.

- Bots are excluded from the identity graph.
- Extra server-side signal: request velocity (rate-limits identity ingestion).

Next:

- Bot confidence score surfaced in admin UI
- Manual overrides + allowlist (per-ip / per-vid)
- “Bot quarantine” view and retention policy to prevent analytics pollution

## Packaging & ecosystem

### 10) Publish to npm + versioned upgrades

- CI build + `dist/` publishing
- `@trevor050/dossier` stable semver releases
- Migration notes per release

## Constraints / non-goals

- TLS ClientHello/JA4 fingerprinting is not available inside standard Vercel Middleware (no access to the handshake).
- Dossier will not implement “supercookie” persistence designed to survive user clear-data actions.
- Dossier will not implement tracker obfuscation intended to evade blocker protections.
