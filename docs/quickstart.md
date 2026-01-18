# Quickstart

This guide assumes the standard setup: **one Dossier deployment per website**.

## 0) Create a new instance

Use one of these:

- GitHub: click "Use this template" on the Dossier repo
- CLI: `npx degit trevor050/dossier my-dossier`

## 1) Deploy Dossier

Deploy the new repo to Vercel (no framework required).

## 2) Configure env vars

Required:

- `DATABASE_URL` (or `POSTGRES_URL*`)
- `ADMIN_TOKEN`

Optional:

- `IPINFO_TOKEN`
- `REPORT_ALLOWED_HOSTS`
- `BOT_SCORE_THRESHOLD` (default `6`)

## 3) Integrate with your site

### Option A: Same-origin proxy (recommended)

Add a rewrite in your site's `vercel.json`:

```json
{
  "rewrites": [
    {
      "source": "/api/:path*",
      "destination": "https://YOUR-DOSSIER-DOMAIN/api/:path*"
    }
  ]
}
```

Then set:

```
VITE_TRACKER_ENDPOINT=/api/collect
```

### Option B: Direct cross-origin

Point your client at Dossier directly:

```
VITE_TRACKER_ENDPOINT=https://YOUR-DOSSIER-DOMAIN/api/collect
```

Add your site domain(s) to `REPORT_ALLOWED_HOSTS` in Dossier.

## 4) Add the client snippet

```ts
import { initDossier } from './tracking';

initDossier();
```

## 5) Open the dashboard

Visit `/api/admin` and enter your `ADMIN_TOKEN`.

## Drop-in install (existing project)

If you want Dossier embedded inside an existing app, run:

```bash
npx degit trevor050/dossier .dossier
node .dossier/scripts/install.mjs --target . --write-package --update-tsconfig
rm -rf .dossier
```
