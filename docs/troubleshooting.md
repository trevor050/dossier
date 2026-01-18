# Troubleshooting

## /api/admin shows 404

- If you are using a rewrite, make sure it maps `/api/:path*` to your Dossier URL.
- Check that your Dossier deployment is live.

## /api/admin asks for Vercel auth

Your Dossier deployment is protected by Vercel authentication. Visit the URL in a browser where you are logged into Vercel.

## /api/collect returns 403

- Add your site domain(s) to `REPORT_ALLOWED_HOSTS`.
- If you use a rewrite, use the same-origin option and set `VITE_TRACKER_ENDPOINT=/api/collect`.

## Admin says "DATABASE_URL not configured"

Set `DATABASE_URL` (or `POSTGRES_URL*`) in your Dossier project environment.

## Admin says "ADMIN_TOKEN not configured"

Set `ADMIN_TOKEN` in your Dossier project environment.
