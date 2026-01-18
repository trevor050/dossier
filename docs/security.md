# Security

- Protect the admin dashboard with a strong `ADMIN_TOKEN`.
- Limit ingest origins via `REPORT_ALLOWED_HOSTS`.
- Consider a dedicated Dossier subdomain.
- Avoid exposing the admin token in client apps or public docs.
- For self‑hosted Postgres, restrict network access to Vercel.
