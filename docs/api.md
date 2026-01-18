# API

## POST /api/collect

Ingest endpoint for client telemetry. Accepts a JSON payload of events, session ids, and summary data.

CORS rules:

- same-origin requests are allowed
- cross-origin requests are allowed only if the `Origin` or `Referer` host is in `REPORT_ALLOWED_HOSTS`

If you proxy through your site with a rewrite, requests are same-origin and no allowlist is required.

## GET /api/admin/status

Public, safe status endpoint. Returns whether DB + admin token are configured.

## POST /api/admin/status

Authenticated; updates tracker settings.

## GET /api/admin/sessions

List sessions (supports `?bots=1`).

## GET /api/admin/session

Single session details.

## GET /api/admin/visitors

Visitor list with aggregation and enrichment.

## GET /api/admin/visitor

Single visitor details + cluster info.
