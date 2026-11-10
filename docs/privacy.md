# What Dossier collects

Dossier is meant to tell you what a specific person did on your site. That is personal data in most legal systems, and this page tries to be precise about it so you can disclose it accurately. It is not legal advice; you, as the person running Dossier, are responsible for telling visitors and for complying with the laws that apply to you (GDPR in the EU/UK, CCPA in California, and so on).

## Stored in your database

| Data | Where it comes from | Why |
| --- | --- | --- |
| Visitor id (random UUID) | Created in the browser, kept in localStorage (or a cookie with `persist: 'cookie'`) | Recognize the same browser on later visits |
| Session id | sessionStorage | Group one visit's events |
| Session cookie id (`dossier_scid`) | First-party session cookie, cleared when the browser closes | Link visits within a browser session if localStorage is cleared |
| Link tag (`?to=...`) | The URL you sent; then kept in localStorage | Attribute visits to the person you sent the link to |
| IP address | The request | Bot detection, approximate location, grouping visits |
| User agent, Accept-Language | Request headers | Browser/OS display, bot detection |
| Screen size, time zone, language, `navigator.webdriver` | The tracker | Device display, bot detection |
| Page path, referrer | The tracker | Where they came from, what they opened |
| Events (see [setup.md](setup.md#what-gets-sent-automatically)) | The tracker | The timeline |
| Time per section, scroll depth, active/idle time | The tracker | "What they looked at" |
| Session replay (only if enabled and sampled) | rrweb, in the browser | Watching the visit back |
| Fingerprint id (only if `fingerprint: true`) | FingerprintJS open source, in the browser | Linking visits across cleared storage |
| Approximate location, network name | Vercel geo headers and/or the enrichment providers you enabled | Map, "where" line |
| Reverse DNS hostname | Your DNS resolver | Network name, bot detection |

Dossier does not read form contents (beyond what a replay would show, and replay masks all inputs by default), does not use third-party cookies, and does not follow people across other websites.

## Shared with third parties

Nothing, by default, except:

- **Your host and database provider** (Vercel, Neon, Supabase...), which process everything above as part of running your site.
- **IPinfo**, only if you set `IPINFO_TOKEN`: receives visitor IP addresses.
- **ipwho.is**, only if you set `DOSSIER_IPWHOIS=1`: receives visitor IP addresses.
- **Your DNS resolver**, for reverse lookups (on by default, `DOSSIER_PTR=0` to disable): sees the IP addresses being looked up.

The tracker script, replay recorder and fingerprint library are all served from your own domain.

## Controls

- **GPC and Do Not Track**: honored by default. A browser sending either is not tracked and no storage is written. Override with `respectPrivacySignals: false` only if you have a reason.
- **Opt-out**: `?dossier=off` on any page stops tracking that browser permanently; `?dossier=on` reverses it. `optOut()` / `optIn()` from the client package let you build a toggle.
- **Replay masking**: every input value is masked; `data-dossier-mask` masks text, `data-dossier-block` excludes an element entirely. Replay is off unless you set a sample rate.
- **Fingerprinting**: off unless you set `fingerprint: true`.
- **Retention**: configurable in Settings (defaults: 365 days for human visits, 30 for bots, 30 for replays). Expired rows are deleted during normal traffic, from Settings → "Run cleanup now", or with `npx dossier prune`. Cached IP lookups expire after 30 days.
- **Deletion**: "Delete all data" on a person removes their visitor records, sessions, events, replays, IP history, identity links, and cached lookups for IPs nobody else used.
- **Bots** are kept for 30 days by default so you can review the filter, and are never added to the identity graph.

## Named links and identity

Named links are the honest part: you know who you sent `?to=admissions-office` to, and the recipient's visit is attributed to that link. If they forward it, the forwarded visits show up under the same link as additional people.

Visits without a link are grouped by inference: shared browser storage, session cookies, an optional fingerprint, and IP + browser matches that fade within hours. This can be wrong in both directions (a shared office network, a cleared browser). The dashboard shows what evidence linked any two visits.

## Suggested disclosure

Something like this, adjusted to what you actually enabled:

> This site uses a self-hosted analytics tool. It records which pages and sections you view, how long you stay, your approximate location, and your browser and device. If you arrived through a personal link, your visits are associated with that link. [Some sessions are recorded for replay, with form inputs masked.] Data is kept for up to [365] days and is not shared with third parties [except IPinfo, which receives IP addresses for location lookups]. Your browser's Global Privacy Control or Do Not Track setting is respected. To opt out, visit [yoursite.com/?dossier=off].
