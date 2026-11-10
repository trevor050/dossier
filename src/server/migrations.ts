import type { Db } from './db.js';

export type Migration = { id: number; name: string; sql: string };

/**
 * Ordered, append-only migrations. Never edit a migration that has shipped;
 * add a new one instead. Migration 1 is written with IF NOT EXISTS everywhere so
 * it also adopts databases created by Dossier 0.1 (which created tables lazily).
 */
export const MIGRATIONS: Migration[] = [
  {
    id: 1,
    name: 'initial',
    sql: `
      CREATE TABLE IF NOT EXISTS visitors (
        vid TEXT PRIMARY KEY,
        display_name TEXT,
        first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        first_ip TEXT,
        last_ip TEXT,
        first_user_agent TEXT,
        last_user_agent TEXT,
        first_referrer TEXT,
        last_referrer TEXT,
        ipinfo JSONB,
        ipinfo_ip TEXT,
        ipinfo_fetched_at TIMESTAMPTZ,
        ipinfo_error TEXT,
        ipinfo_error_at TIMESTAMPTZ,
        ptr TEXT,
        ptr_ip TEXT,
        ptr_fetched_at TIMESTAMPTZ,
        ptr_error TEXT,
        ptr_error_at TIMESTAMPTZ
      );
      ALTER TABLE visitors ADD COLUMN IF NOT EXISTS display_name TEXT;
      ALTER TABLE visitors ADD COLUMN IF NOT EXISTS first_ref_tag TEXT;
      ALTER TABLE visitors ADD COLUMN IF NOT EXISTS last_ref_tag TEXT;
      ALTER TABLE visitors ADD COLUMN IF NOT EXISTS first_fingerprint_id TEXT;
      ALTER TABLE visitors ADD COLUMN IF NOT EXISTS last_fingerprint_id TEXT;
      ALTER TABLE visitors ADD COLUMN IF NOT EXISTS ptr TEXT;
      ALTER TABLE visitors ADD COLUMN IF NOT EXISTS ptr_ip TEXT;
      ALTER TABLE visitors ADD COLUMN IF NOT EXISTS ptr_fetched_at TIMESTAMPTZ;
      ALTER TABLE visitors ADD COLUMN IF NOT EXISTS ptr_error TEXT;
      ALTER TABLE visitors ADD COLUMN IF NOT EXISTS ptr_error_at TIMESTAMPTZ;

      CREATE TABLE IF NOT EXISTS sessions (
        sid TEXT PRIMARY KEY,
        vid TEXT NOT NULL REFERENCES visitors(vid) ON DELETE CASCADE,
        started_at TIMESTAMPTZ NOT NULL,
        ended_at TIMESTAMPTZ,
        ip TEXT,
        ptr TEXT,
        user_agent TEXT,
        accept_language TEXT,
        referrer TEXT,
        page TEXT,
        is_mobile BOOLEAN,
        orientation TEXT,
        geo JSONB,
        bot_score INTEGER,
        bot_reasons TEXT,
        is_bot BOOLEAN,
        ipinfo JSONB,
        first_interaction_seconds INTEGER,
        interactions INTEGER,
        active_seconds INTEGER,
        idle_seconds INTEGER,
        session_seconds INTEGER,
        overlays JSONB,
        overlays_unique INTEGER,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      ALTER TABLE sessions ADD COLUMN IF NOT EXISTS ptr TEXT;
      ALTER TABLE sessions ADD COLUMN IF NOT EXISTS idle_seconds INTEGER;
      ALTER TABLE sessions ADD COLUMN IF NOT EXISTS session_seconds INTEGER;
      ALTER TABLE sessions ADD COLUMN IF NOT EXISTS session_cookie_id TEXT;
      ALTER TABLE sessions ADD COLUMN IF NOT EXISTS fingerprint_id TEXT;
      ALTER TABLE sessions ADD COLUMN IF NOT EXISTS ref_tag TEXT;

      CREATE TABLE IF NOT EXISTS events (
        id BIGSERIAL PRIMARY KEY,
        sid TEXT NOT NULL REFERENCES sessions(sid) ON DELETE CASCADE,
        vid TEXT NOT NULL REFERENCES visitors(vid) ON DELETE CASCADE,
        ts TIMESTAMPTZ NOT NULL,
        type TEXT NOT NULL,
        seq INTEGER,
        data JSONB
      );

      CREATE TABLE IF NOT EXISTS session_ips (
        sid TEXT NOT NULL REFERENCES sessions(sid) ON DELETE CASCADE,
        ip TEXT NOT NULL,
        first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        hit_count INTEGER NOT NULL DEFAULT 1,
        PRIMARY KEY (sid, ip)
      );

      CREATE TABLE IF NOT EXISTS identity_edges (
        a TEXT NOT NULL,
        b TEXT NOT NULL,
        kind TEXT NOT NULL,
        weight DOUBLE PRECISION NOT NULL CHECK (weight >= 0 AND weight <= 1),
        decay_lambda DOUBLE PRECISION NOT NULL CHECK (decay_lambda >= 0),
        first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        hits INTEGER NOT NULL DEFAULT 1,
        PRIMARY KEY (a, b, kind)
      );

      CREATE TABLE IF NOT EXISTS replay_events (
        id BIGSERIAL PRIMARY KEY,
        sid TEXT NOT NULL REFERENCES sessions(sid) ON DELETE CASCADE,
        vid TEXT NOT NULL REFERENCES visitors(vid) ON DELETE CASCADE,
        ts TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        chunk_seq INTEGER,
        events JSONB NOT NULL
      );

      CREATE TABLE IF NOT EXISTS visitor_groups (
        group_id TEXT PRIMARY KEY,
        display_name TEXT,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS ipinfo_cache (
        ip TEXT PRIMARY KEY,
        data JSONB,
        fetched_at TIMESTAMPTZ,
        error TEXT,
        error_at TIMESTAMPTZ
      );
      CREATE TABLE IF NOT EXISTS ptr_cache (
        ip TEXT PRIMARY KEY,
        ptr TEXT,
        fetched_at TIMESTAMPTZ,
        error TEXT,
        error_at TIMESTAMPTZ
      );
      CREATE TABLE IF NOT EXISTS freeip_cache (
        ip TEXT PRIMARY KEY,
        data JSONB,
        fetched_at TIMESTAMPTZ,
        error TEXT,
        error_at TIMESTAMPTZ
      );

      CREATE TABLE IF NOT EXISTS tracker_settings (
        id INTEGER PRIMARY KEY,
        retention_human_days INTEGER NOT NULL,
        retention_bot_days INTEGER NOT NULL,
        map_include_bots_default BOOLEAN NOT NULL DEFAULT false,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      ALTER TABLE tracker_settings ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
      INSERT INTO tracker_settings (id, retention_human_days, retention_bot_days, map_include_bots_default)
      VALUES (1, 365, 30, false)
      ON CONFLICT (id) DO NOTHING;

      CREATE INDEX IF NOT EXISTS idx_identity_edges_a ON identity_edges(a);
      CREATE INDEX IF NOT EXISTS idx_identity_edges_b ON identity_edges(b);
      CREATE INDEX IF NOT EXISTS idx_identity_edges_last_seen ON identity_edges(last_seen_at DESC);
      CREATE INDEX IF NOT EXISTS idx_session_ips_sid ON session_ips(sid);
      CREATE INDEX IF NOT EXISTS idx_sessions_cookie ON sessions(session_cookie_id);
      CREATE INDEX IF NOT EXISTS idx_sessions_fpid ON sessions(fingerprint_id);
      CREATE INDEX IF NOT EXISTS idx_replay_events_sid_id ON replay_events(sid, id);
      CREATE INDEX IF NOT EXISTS idx_events_sid_ts ON events(sid, ts);
      CREATE INDEX IF NOT EXISTS idx_sessions_started_at ON sessions(started_at DESC);
      CREATE INDEX IF NOT EXISTS idx_sessions_is_bot_started_at ON sessions(is_bot, started_at DESC);
    `,
  },
  {
    id: 2,
    name: 'dossier-0.2',
    sql: `
      ALTER TABLE visitors ADD COLUMN IF NOT EXISTS label TEXT;
      ALTER TABLE visitors ADD COLUMN IF NOT EXISTS bot_override BOOLEAN;

      ALTER TABLE sessions ADD COLUMN IF NOT EXISTS sections JSONB;
      ALTER TABLE sessions ADD COLUMN IF NOT EXISTS pages JSONB;
      ALTER TABLE sessions ADD COLUMN IF NOT EXISTS max_scroll_pct INTEGER;
      ALTER TABLE sessions ADD COLUMN IF NOT EXISTS device JSONB;
      ALTER TABLE sessions ADD COLUMN IF NOT EXISTS event_count INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE sessions ADD COLUMN IF NOT EXISTS replay_bytes INTEGER NOT NULL DEFAULT 0;

      ALTER TABLE replay_events ADD COLUMN IF NOT EXISTS bytes INTEGER;

      ALTER TABLE tracker_settings ADD COLUMN IF NOT EXISTS retention_replay_days INTEGER NOT NULL DEFAULT 30;

      CREATE INDEX IF NOT EXISTS idx_sessions_vid_started ON sessions(vid, started_at DESC);
      CREATE INDEX IF NOT EXISTS idx_sessions_ip_started ON sessions(ip, started_at DESC);
      CREATE INDEX IF NOT EXISTS idx_replay_events_ts ON replay_events(ts);
      CREATE INDEX IF NOT EXISTS idx_events_type_ts ON events(type, ts);

      -- Named links: one per recipient, e.g. /?to=colgate-admissions or an opaque /?to=k3x9qa.
      CREATE TABLE IF NOT EXISTS links (
        id TEXT PRIMARY KEY,
        slug TEXT NOT NULL UNIQUE,
        label TEXT NOT NULL,
        path TEXT NOT NULL DEFAULT '/',
        note TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        archived_at TIMESTAMPTZ
      );
      ALTER TABLE sessions ADD COLUMN IF NOT EXISTS link_id TEXT REFERENCES links(id) ON DELETE SET NULL;
      CREATE INDEX IF NOT EXISTS idx_sessions_link ON sessions(link_id);
      CREATE INDEX IF NOT EXISTS idx_sessions_ref_tag ON sessions(ref_tag);
    `,
  },
];

export const LATEST_MIGRATION = MIGRATIONS[MIGRATIONS.length - 1]!.id;

const BOOKKEEPING = `
  CREATE TABLE IF NOT EXISTS dossier_migrations (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
`;

export async function appliedMigrations(db: Db): Promise<number[]> {
  try {
    const { rows } = await db.query<{ id: number }>(`SELECT id FROM dossier_migrations ORDER BY id`);
    return rows.map((r) => Number(r.id));
  } catch {
    return [];
  }
}

/** Apply all pending migrations, each in its own transaction. Safe to run repeatedly. */
export async function migrate(db: Db, log: (msg: string) => void = () => {}): Promise<string[]> {
  await db.exec(BOOKKEEPING);
  const done = new Set(await appliedMigrations(db));
  const applied: string[] = [];
  for (const m of MIGRATIONS) {
    if (done.has(m.id)) continue;
    log(`applying ${String(m.id).padStart(3, '0')}_${m.name}`);
    await db.exec(
      `BEGIN;\n${m.sql}\nINSERT INTO dossier_migrations (id, name) VALUES (${m.id}, '${m.name}') ON CONFLICT (id) DO NOTHING;\nCOMMIT;`,
    );
    applied.push(`${m.id}_${m.name}`);
  }
  return applied;
}

export class SchemaNotReadyError extends Error {
  constructor(public readonly current: number) {
    super(
      current === 0
        ? 'Dossier tables are missing. Run `npx dossier migrate` with DATABASE_URL set.'
        : `Dossier schema is at version ${current}, expected ${LATEST_MIGRATION}. Run \`npx dossier migrate\`.`,
    );
  }
}

const readyDbs = new WeakSet<Db>();

/** Throws SchemaNotReadyError when migrations are pending. Cached per process once ready. */
export async function assertSchemaReady(db: Db): Promise<void> {
  if (readyDbs.has(db)) return;
  const ids = await appliedMigrations(db);
  const current = ids.length ? Math.max(...ids) : 0;
  if (current < LATEST_MIGRATION) throw new SchemaNotReadyError(current);
  readyDbs.add(db);
}
