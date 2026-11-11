# How visits are grouped into people

There are two ways a visit gets a name in Dossier.

## 1. Named links (reliable)

You create a link per recipient in the dashboard. Each has a readable slug (`?to=admissions-office`) and an opaque code (`?to=k7m2xq4`); both point to the same link. The tracker reads the tag, removes it from the address bar, and keeps it in localStorage so return visits from the same browser are attributed too.

Tags that don't match a link are kept as-is and shown by name (useful for ad-hoc `?to=twitter`). Creating a link later with that slug claims those earlier visits.

If a recipient forwards the link, each new browser shows up as another person under the same link. That's usually what you want to know.

## 2. Inference (a good guess)

Without a link, Dossier connects visitor ids through a small graph of **signals**:

| Node | Source | Notes |
| --- | --- | --- |
| `vid:` | Random id in localStorage | One per browser profile |
| `scid:` | First-party session cookie | Survives a localStorage clear within one browser session |
| `fp:` | FingerprintJS open source | Only with `fingerprint: true` |
| `ipua:` | IP address + hashed user agent | IP is never a node by itself |

Each request adds edges between the signals it carried, with a base weight and a half-life:

| Edge | Weight | Half-life |
| --- | --- | --- |
| visitor id ↔ session cookie | 0.95 | 180 days |
| session cookie ↔ fingerprint | 0.85 | 90 days |
| visitor id ↔ fingerprint | 0.75 | 45 days |
| session cookie ↔ IP+UA | 0.35 | 2 hours |
| fingerprint ↔ IP+UA | 0.25 | 2 hours |
| visitor id ↔ IP+UA | 0.20 | 1 hour |

An edge's effective weight is `weight × 0.5^(age / half-life)`.

**Confidence that two visitor ids are the same person** is the larger of:

- the strongest path between them, where a path's strength is the **product** of its edges (a chain is only as strong as its weakest links), and
- the **noisy-or** of the independent two-hop paths through each signal they share directly: `1 − (1 − p₁)(1 − p₂)…`

Paths don't pass through other visitor ids, so A ~ B and B ~ C doesn't automatically mean A ~ C; it has to be earned through shared signals. Visitor ids at or above `DOSSIER_LINK_THRESHOLD` (default 0.5) are grouped into one person.

What that means in practice:

- Same session cookie: 0.95 × 0.95 ≈ 0.90. Grouped.
- Same fresh fingerprint: 0.75 × 0.75 ≈ 0.56. Grouped while recent.
- Same IP and browser, nothing else: 0.2 × 0.2 = 0.04. Not grouped. A dorm, an office or a VPN exit is not a person.

The person page has a "How these visits were grouped" section showing the evidence and confidence for each pair.

Bots never write identity edges.

### Changes from 0.1

Dossier 0.1 combined edges *along* a path with noisy-or, so a chain of weak IP matches became more confident the longer it got. Paths now multiply, and noisy-or is only used across independent signals. Edge data in existing databases is compatible; grouping just becomes more conservative.

## Limits

- Private/incognito windows usually start with empty storage, so without a link or fingerprint they look like a new person.
- Fingerprints are less stable on iOS Safari and in privacy-focused browsers.
- Shared devices look like one person.
- The dashboard groups the visitors in the selected time range; very old evidence decays away by design.
