import pg from 'pg';

export type Row = Record<string, unknown>;

/**
 * Minimal database surface Dossier needs. Implemented by a `pg` Pool for real
 * deployments and by PGlite for demo mode and tests.
 */
export interface Db {
  query<T extends Row = Row>(text: string, params?: unknown[]): Promise<{ rows: T[] }>;
  /** Run one or more statements without parameters (used by migrations). */
  exec(sql: string): Promise<void>;
  close(): Promise<void>;
}

let override: Db | null = null;
let pooled: Db | null = null;

export function databaseUrl(env: NodeJS.ProcessEnv = process.env): string | undefined {
  return (
    env.DOSSIER_DATABASE_URL ||
    env.DATABASE_URL ||
    env.POSTGRES_URL ||
    env.POSTGRES_PRISMA_URL ||
    env.POSTGRES_URL_NON_POOLING ||
    undefined
  );
}

export function createPgDb(connectionString: string, env: NodeJS.ProcessEnv = process.env): Db {
  const sslMode = (env.DOSSIER_DB_SSL ?? '').toLowerCase();
  const pool = new pg.Pool({
    connectionString,
    max: Math.max(1, Math.min(20, Number(env.DOSSIER_DB_POOL_MAX ?? 3) || 3)),
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 8_000,
    // Only relax certificate checks when the operator explicitly asks for it.
    ...(sslMode === 'no-verify' ? { ssl: { rejectUnauthorized: false } } : {}),
  });
  pool.on('error', (err) => {
    console.error('[dossier] postgres pool error:', err.message);
  });
  return {
    async query<T extends Row = Row>(text: string, params: unknown[] = []) {
      const res = await pool.query(text, params as unknown[]);
      return { rows: res.rows as T[] };
    },
    async exec(sql: string) {
      await pool.query(sql);
    },
    async close() {
      await pool.end();
    },
  };
}

/** Create an embedded Postgres (PGlite). In-memory unless `dataDir` is given. */
export async function createPgliteDb(dataDir?: string): Promise<Db> {
  let mod: typeof import('@electric-sql/pglite');
  try {
    mod = await import('@electric-sql/pglite');
  } catch {
    throw new Error(
      'Demo mode needs the optional dependency @electric-sql/pglite. Install it with: npm install @electric-sql/pglite',
    );
  }
  const db = dataDir ? new mod.PGlite(dataDir) : new mod.PGlite();
  await db.waitReady;
  return {
    async query<T extends Row = Row>(text: string, params: unknown[] = []) {
      const res = await db.query<T>(text, params as unknown[]);
      return { rows: res.rows };
    },
    async exec(sql: string) {
      await db.exec(sql);
    },
    async close() {
      await db.close();
    },
  };
}

/** Use a specific database (tests, demo mode, custom hosting). Pass `null` to reset. */
export function setDb(db: Db | null): void {
  override = db;
}

/** The active database, or `null` when no connection string is configured. */
export function getDb(): Db | null {
  if (override) return override;
  if (pooled) return pooled;
  const url = databaseUrl();
  if (!url) return null;
  pooled = createPgDb(url);
  return pooled;
}

export async function closeDb(): Promise<void> {
  const db = override ?? pooled;
  override = null;
  pooled = null;
  if (db) await db.close();
}
