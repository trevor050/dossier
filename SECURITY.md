# Security

Please report vulnerabilities privately, either through GitHub's "Report a vulnerability" button on this repo or by email to trevorr2615169@gmail.com with "Dossier Security" in the subject. I'll reply within a few days.

## What Dossier defends against

**The dashboard** holds personal data, so it is treated as the sensitive part:

- The admin token is compared in constant time, must be at least 16 characters, and login attempts are rate limited per IP.
- Signing in sets an `HttpOnly`, `SameSite=Strict`, `Secure` (on HTTPS) cookie scoped to `/api/admin`, containing an expiry and an HMAC keyed from the token. The token itself is never stored in the browser, never placed in a URL, and never logged. Rotating the token signs everyone out.
- State-changing requests also require a same-origin `Origin` header.
- The dashboard is served with a strict Content Security Policy (`script-src 'self'`, no inline scripts, `frame-ancestors 'none'`). All of its code, including the replay player, is bundled and served first-party; nothing is loaded from a CDN.
- Visitor-supplied strings are rendered as text, never HTML. Replays render in rrweb's sandboxed iframe under the same CSP.

**The collector** is a public endpoint that anyone can post to, so it assumes hostile input:

- Bodies are size-limited before parsing (64 KB events, 1 MB replay chunks) and validated field by field: ids, event names, timestamps, URLs, numbers and nested data are all bounded.
- Events and replay bytes are capped per session; requests are rate limited per IP (per instance on serverless).
- Every query is parameterized.
- Cross-origin posting is limited to your own host plus `DOSSIER_ALLOWED_HOSTS`; localhost is refused in production. This stops other sites from writing through visitors' browsers. It does not stop direct scripted traffic, which is what validation, caps and bot scoring are for.
- Client IPs come from platform headers on Vercel and from the socket elsewhere, unless you opt into `--trust-proxy`.

**Outbound requests** go only to IP enrichment providers you enabled, with the IPinfo token in an `Authorization` header and a 2.5 s timeout.

## Known limits

- In-memory rate limits are per serverless instance, not global.
- A determined attacker can fill your database with plausible-looking fake visits up to the per-IP and per-session limits. Retention and the bot view help clean up; Vercel's firewall or a WAF is the real fix if that ever matters to you.
