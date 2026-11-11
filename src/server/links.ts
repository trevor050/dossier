import { randomBytes } from 'node:crypto';
import type { Db } from './db.js';
import { cleanString } from './validate.js';

export type LinkRow = {
  id: string;
  slug: string;
  label: string;
  path: string;
  note: string | null;
  created_at: string;
  archived_at: string | null;
};

const CODE_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'; // no 0/o/1/l/i

/** Opaque 7-character code for links that should not reveal their label. */
export function makeCode(bytes: Buffer = randomBytes(7)): string {
  let out = '';
  for (const b of bytes) out += CODE_ALPHABET[b % CODE_ALPHABET.length];
  return out;
}

/** "Colgate Admissions!" -> "colgate-admissions". */
export function slugify(label: string): string {
  return label
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,59}$/;

export type CreateLinkInput = { label?: unknown; slug?: unknown; path?: unknown; note?: unknown };

export async function createLink(db: Db, input: CreateLinkInput): Promise<LinkRow> {
  const label = cleanString(input.label, 80);
  if (!label) throw new Error('label is required');
  const slug = slugify(cleanString(input.slug, 60) ?? label);
  if (!SLUG_RE.test(slug)) throw new Error('slug must be letters, numbers and dashes');
  let path = cleanString(input.path, 300) ?? '/';
  if (!path.startsWith('/')) path = `/${path}`;
  const note = cleanString(input.note, 500);

  const clash = await db.query(`SELECT 1 FROM links WHERE slug = $1 OR id = $1`, [slug]);
  if (clash.rows.length) throw new Error(`a link named "${slug}" already exists`);

  let id = makeCode();
  for (let i = 0; i < 5; i++) {
    const taken = await db.query(`SELECT 1 FROM links WHERE id = $1 OR slug = $1`, [id]);
    if (!taken.rows.length) break;
    id = makeCode();
  }
  const { rows } = await db.query<LinkRow>(
    `INSERT INTO links (id, slug, label, path, note) VALUES ($1, $2, $3, $4, $5)
     RETURNING id, slug, label, path, note, created_at, archived_at`,
    [id, slug, label, path, note],
  );
  // Attach visits that already used this tag before the link was created.
  await db.query(`UPDATE sessions SET link_id = $1 WHERE link_id IS NULL AND lower(ref_tag) IN ($2, $1)`, [id, slug]);
  return rows[0]!;
}

export async function updateLink(
  db: Db,
  id: string,
  patch: { label?: unknown; note?: unknown; archived?: unknown },
): Promise<void> {
  const label = cleanString(patch.label, 80);
  const note = patch.note === undefined ? undefined : cleanString(patch.note, 500);
  await db.query(
    `UPDATE links SET
       label = COALESCE($2, label),
       note = CASE WHEN $3::boolean THEN $4 ELSE note END,
       archived_at = CASE WHEN $5::boolean IS NULL THEN archived_at WHEN $5 THEN COALESCE(archived_at, NOW()) ELSE NULL END
     WHERE id = $1`,
    [id, label, note !== undefined, note ?? null, typeof patch.archived === 'boolean' ? patch.archived : null],
  );
}

export async function deleteLink(db: Db, id: string): Promise<void> {
  await db.query(`DELETE FROM links WHERE id = $1`, [id]);
}

/** Map a captured `?to=` tag to a link id (matches the opaque code or the slug). */
export async function resolveLinkId(db: Db, tag: string | null): Promise<string | null> {
  if (!tag) return null;
  const { rows } = await db.query<{ id: string }>(
    `SELECT id FROM links WHERE id = $1 OR slug = lower($1) LIMIT 1`,
    [tag],
  );
  return rows[0]?.id ?? null;
}
