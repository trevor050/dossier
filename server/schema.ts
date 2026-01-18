import { query } from './db.js';

let schemaReady: Promise<void> | null = null;

export function ensureSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = (async () => {
      await query(`
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
      `);

      await query(`
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
      `);

      // Backfill for older schemas (idempotent).
      await query(`ALTER TABLE visitors ADD COLUMN IF NOT EXISTS display_name TEXT;`);
      await query(`ALTER TABLE visitors ADD COLUMN IF NOT EXISTS ptr TEXT;`);
      await query(`ALTER TABLE visitors ADD COLUMN IF NOT EXISTS ptr_ip TEXT;`);
      await query(`ALTER TABLE visitors ADD COLUMN IF NOT EXISTS ptr_fetched_at TIMESTAMPTZ;`);
      await query(`ALTER TABLE visitors ADD COLUMN IF NOT EXISTS ptr_error TEXT;`);
      await query(`ALTER TABLE visitors ADD COLUMN IF NOT EXISTS ptr_error_at TIMESTAMPTZ;`);
      await query(`ALTER TABLE visitors ADD COLUMN IF NOT EXISTS first_ref_tag TEXT;`);
      await query(`ALTER TABLE visitors ADD COLUMN IF NOT EXISTS last_ref_tag TEXT;`);
      await query(`ALTER TABLE visitors ADD COLUMN IF NOT EXISTS first_fingerprint_id TEXT;`);
      await query(`ALTER TABLE visitors ADD COLUMN IF NOT EXISTS last_fingerprint_id TEXT;`);

      await query(`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS ptr TEXT;`);
      await query(`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS idle_seconds INTEGER;`);
      await query(`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS session_seconds INTEGER;`);
      await query(`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS session_cookie_id TEXT;`);
      await query(`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS fingerprint_id TEXT;`);
      await query(`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS ref_tag TEXT;`);

      await query(`
        CREATE TABLE IF NOT EXISTS events (
          id BIGSERIAL PRIMARY KEY,
          sid TEXT NOT NULL REFERENCES sessions(sid) ON DELETE CASCADE,
          vid TEXT NOT NULL REFERENCES visitors(vid) ON DELETE CASCADE,
          ts TIMESTAMPTZ NOT NULL,
          type TEXT NOT NULL,
          seq INTEGER,
          data JSONB
        );
      `);

      await query(`
        CREATE TABLE IF NOT EXISTS session_ips (
          sid TEXT NOT NULL REFERENCES sessions(sid) ON DELETE CASCADE,
          ip TEXT NOT NULL,
          first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          hit_count INTEGER NOT NULL DEFAULT 1,
          PRIMARY KEY (sid, ip)
        );
      `);

      await query(`CREATE INDEX IF NOT EXISTS idx_session_ips_sid ON session_ips(sid);`);
      await query(`CREATE INDEX IF NOT EXISTS idx_sessions_cookie ON sessions(session_cookie_id);`);
      await query(`CREATE INDEX IF NOT EXISTS idx_sessions_fpid ON sessions(fingerprint_id);`);

      await query(`
        CREATE TABLE IF NOT EXISTS visitor_groups (
          group_id TEXT PRIMARY KEY,
          display_name TEXT,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);

      await query(`
        CREATE INDEX IF NOT EXISTS idx_events_sid_ts ON events(sid, ts);
      `);

      await query(`
        CREATE INDEX IF NOT EXISTS idx_sessions_started_at ON sessions(started_at DESC);
      `);

      await query(`
        CREATE INDEX IF NOT EXISTS idx_sessions_is_bot_started_at ON sessions(is_bot, started_at DESC);
      `);

      await query(`
        CREATE TABLE IF NOT EXISTS ipinfo_cache (
          ip TEXT PRIMARY KEY,
          data JSONB,
          fetched_at TIMESTAMPTZ,
          error TEXT,
          error_at TIMESTAMPTZ
        );
      `);

      await query(`
        CREATE TABLE IF NOT EXISTS ptr_cache (
          ip TEXT PRIMARY KEY,
          ptr TEXT,
          fetched_at TIMESTAMPTZ,
          error TEXT,
          error_at TIMESTAMPTZ
        );
      `);

      await query(`
        CREATE TABLE IF NOT EXISTS freeip_cache (
          ip TEXT PRIMARY KEY,
          data JSONB,
          fetched_at TIMESTAMPTZ,
          error TEXT,
          error_at TIMESTAMPTZ
        );
      `);

      await query(`
        CREATE TABLE IF NOT EXISTS tracker_settings (
          id INTEGER PRIMARY KEY,
          retention_human_days INTEGER NOT NULL,
          retention_bot_days INTEGER NOT NULL,
          map_include_bots_default BOOLEAN NOT NULL DEFAULT false,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);

      await query(`ALTER TABLE tracker_settings ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();`);

      await query(
        `
          INSERT INTO tracker_settings (id, retention_human_days, retention_bot_days, map_include_bots_default)
          VALUES (1, 365, 30, false)
          ON CONFLICT (id) DO NOTHING
        `,
      );
    })();
  }

  return schemaReady;
}
