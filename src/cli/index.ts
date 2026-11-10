#!/usr/bin/env node
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, join, resolve } from 'node:path';
import { createAdminHandler } from '../server/admin/handler.js';
import { createCollectHandler } from '../server/collect.js';
import { closeDb, createPgDb, createPgliteDb, databaseUrl, type Db } from '../server/db.js';
import { migrate } from '../server/migrations.js';
import { toNodeListener } from '../server/node.js';
import { getSettings, pruneExpired } from '../server/retention.js';
import { sampleSite } from '../demo/sample-site.js';
import { seedDemo } from '../demo/seed.js';
import { VERSION } from '../version.js';

const HELP = `dossier ${VERSION}

Usage: npx dossier <command> [options]

Commands
  init               Add api/collect.ts and api/admin.ts to this project (Vercel)
  migrate            Create or upgrade the Postgres tables (needs DATABASE_URL)
  demo               Run the dashboard on fake data, no database needed
  serve              Run collector + dashboard as a plain Node server (needs DATABASE_URL)
  prune              Delete data older than your retention settings
  token              Print a random admin token

Options
  --port <n>         Port for demo/serve (default 8787)
  --sample           serve: also serve a sample site at / that sends events
  --trust-proxy      serve: read client IPs from X-Forwarded-For (only behind your own proxy)
  --dir <path>       init: project directory (default .)
  --force            init: overwrite existing files

Environment is read from the process and from .env / .env.local in the current directory.
`;

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const flag = (name: string) => process.argv.includes(`--${name}`);

/** Minimal .env loader: KEY=value lines, existing environment wins. */
function loadEnvFiles() {
  for (const file of ['.env', '.env.local']) {
    const path = resolve(file);
    if (!existsSync(path)) continue;
    for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
      const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
      if (!m || process.env[m[1]!] !== undefined) continue;
      process.env[m[1]!] = m[2]!.replace(/^(['"])(.*)\1$/, '$2');
    }
  }
}

function requireDb(): Db {
  const url = databaseUrl();
  if (!url) {
    console.error('DATABASE_URL is not set. Put it in .env or export it, e.g.\n  DATABASE_URL=postgres://user:pass@host:5432/db npx dossier migrate');
    process.exit(1);
  }
  return createPgDb(url);
}

function listen(handlers: { collect: ReturnType<typeof createCollectHandler>; admin: ReturnType<typeof createAdminHandler> }, opts: { port: number; sample: boolean; replay: number; trustProxy: boolean }) {
  const collect = toNodeListener(handlers.collect, { trustProxy: opts.trustProxy });
  const admin = toNodeListener(handlers.admin, { trustProxy: opts.trustProxy });
  const html = sampleSite({ replay: opts.replay });
  const server = createServer((req, res) => {
    const path = (req.url ?? '/').split('?')[0]!.replace(/\/+$/, '') || '/';
    if (path === '/api/collect') return void collect(req, res);
    if (path === '/api/admin') return void admin(req, res);
    if (opts.sample && path === '/') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
      return void res.end(html);
    }
    res.writeHead(path === '/' ? 302 : 404, path === '/' ? { location: '/api/admin' } : {});
    res.end();
  });
  server.listen(opts.port, () => {
    const base = `http://localhost:${opts.port}`;
    console.log(`\n  Dashboard  ${base}/api/admin`);
    if (opts.sample) console.log(`  Sample     ${base}/   (try ${base}/?to=admissions-office)`);
    console.log(`  Collector  ${base}/api/collect\n`);
  });
  const stop = async () => {
    server.close();
    await closeDb().catch(() => {});
    process.exit(0);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

const SHIMS: Record<string, string> = {
  'api/collect.ts': `// Dossier collector: events, replay chunks, and the tracker script (GET).\nexport { default } from '@trevor050/dossier/vercel/collect';\n`,
  'api/admin.ts': `// Dossier dashboard and admin API, protected by DOSSIER_ADMIN_TOKEN.\nexport { default } from '@trevor050/dossier/vercel/admin';\n`,
};

async function main() {
  const cmd = process.argv[2];
  loadEnvFiles();
  const port = Number(arg('port') ?? process.env.PORT ?? 8787);

  switch (cmd) {
    case 'init': {
      const dir = resolve(arg('dir') ?? '.');
      for (const [file, body] of Object.entries(SHIMS)) {
        const path = join(dir, file);
        if (existsSync(path) && !flag('force')) {
          console.log(`  skip   ${file} (exists; --force to overwrite)`);
          continue;
        }
        mkdirSync(dirname(path), { recursive: true });
        writeFileSync(path, body);
        console.log(`  create ${file}`);
      }
      console.log(`
Next:
  1. Set environment variables (Vercel project settings, and .env for local commands):
       DATABASE_URL=postgres://...
       DOSSIER_ADMIN_TOKEN=${randomBytes(24).toString('base64url')}
  2. Create the tables:   npx dossier migrate
  3. Add the tracker to your site's HTML:
       <script defer src="/api/collect"></script>
     or, in a bundled app:  import { initDossier } from '@trevor050/dossier/client'; initDossier();
  4. Deploy, then open /api/admin and create a link for each person you send it to.
`);
      return;
    }
    case 'migrate': {
      const db = requireDb();
      try {
        const applied = await migrate(db, (m) => console.log(`  ${m}`));
        console.log(applied.length ? `Applied ${applied.length} migration(s).` : 'Already up to date.');
      } finally {
        await db.close();
      }
      return;
    }
    case 'prune': {
      const db = requireDb();
      try {
        const result = await pruneExpired(db, await getSettings(db), 10_000);
        console.log(result);
      } finally {
        await db.close();
      }
      return;
    }
    case 'demo': {
      console.log('Starting demo with an in-memory database and fake visitors…');
      const db = await createPgliteDb();
      await migrate(db);
      await seedDemo(db);
      listen(
        { collect: createCollectHandler({ db }), admin: createAdminHandler({ db, demo: true }) },
        { port, sample: true, replay: 1, trustProxy: false },
      );
      return;
    }
    case 'serve': {
      const db = requireDb();
      listen(
        { collect: createCollectHandler({ db }), admin: createAdminHandler({ db }) },
        { port, sample: flag('sample'), replay: Number(arg('replay') ?? 1), trustProxy: flag('trust-proxy') },
      );
      return;
    }
    case 'token':
      console.log(randomBytes(24).toString('base64url'));
      return;
    case undefined:
    case 'help':
    case '--help':
    case '-h':
      console.log(HELP);
      return;
    case '--version':
    case '-v':
      console.log(VERSION);
      return;
    default:
      console.error(`Unknown command "${cmd}".\n`);
      console.log(HELP);
      process.exit(1);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
