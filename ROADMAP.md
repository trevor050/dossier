# Roadmap

This roadmap focuses on making Dossier *better at identity resolution* for low-traffic sites, without turning it into “creepy cross-site tracking”.

## Identity resolution (highest priority)

### 1) Confidence scoring + explainability

Today, “related” is effectively `shared_cookie OR shared_ip OR shared_fingerprint`.

Planned:

- Compute links as **edges** with a **confidence score** (0–100)
- Show “why” for every link (signals + timestamps), e.g.:
  - `fingerprint_id match (high)`
  - `cookie match (high)`
  - `IP match (low) + ASN is mobile carrier (very low)`
- UI: allow filtering to “only high confidence links”

### 2) Make IP a *weak* signal by default

Improve false-positive handling:

- IP-only should not automatically merge a person; it should be “possible match”
- Add time window: `shared_ip within N hours/days`
- Penalize known VPN/datacenter ASNs (PacketHub, etc.) for linking
- Prefer / weight **session_cookie_id** and **fingerprint_id**

### 3) Stable-but-scoped “first-party device key” (optional)

For sites that want stronger linking without FingerprintJS:

- Generate a **site-scoped** device key on first visit and store it (cookie + localStorage)
- Rotate / reset on demand
- Never share across different domains

### 4) Multiple “identity buckets” instead of one global cluster

Current `group_id` hashing mixes signals into a single key.

Planned:

- Maintain separate buckets:
  - cookie cluster
  - fingerprint cluster
  - IP cluster (weak)
- Compute “person clusters” by graph traversal + scoring, not by one hash

## Fingerprinting improvements

### 5) Make fingerprinting explicitly opt-in + configurable

- Default remains **on** for Dossier’s “portfolio analytics” use case
- Provide explicit docs + flags:
  - `fingerprinting: false`
  - future: `fingerprinting: { provider: 'fingerprintjs' | 'none' }`

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

- Don’t let bot traffic contaminate identity graph
- Add “bot confidence” and allow manual overrides in admin UI

## Packaging & ecosystem

### 10) Publish to npm + versioned upgrades

- CI build + `dist/` publishing
- `@trevor050/dossier` stable semver releases
- Migration notes per release

