# Database schema

Dossier auto‑creates tables on demand via `ensureSchema()`.

Tables:

- `visitors` — visitor ids + first/last metadata
- `sessions` — one row per session
- `events` — event stream (batched)
- `session_ips` — per‑session IP history
- `visitor_groups` — clustering helper table
- `ipinfo_cache` — IPinfo cache
- `ptr_cache` — PTR reverse DNS cache
- `freeip_cache` — fallback IP enrichment cache
- `tracker_settings` — retention + UI defaults
