import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createAdminHandler } from '../src/server/admin/handler.js';
import { createPgliteDb, type Db } from '../src/server/db.js';
import { migrate } from '../src/server/migrations.js';

let db: Db;
const token = 'test-malformed-body-token-web-a';
beforeAll(async () => {
  process.env.DOSSIER_ADMIN_TOKEN = token;
  db = await createPgliteDb();
  await migrate(db);
});
afterAll(() => db.close());

describe('admin JSON object validation', () => {
  for (const route of ['login', 'links', 'label', 'mark', 'delete', 'settings']) {
    it.each([null, [], 'text', 17])(`rejects a non-object body for ${route}: %j`, async (body) => {
      const response = await createAdminHandler({ db })(new Request(`https://site.example/api/admin?api=${route}`, {
        method: 'POST',
        headers: { origin: 'https://site.example', authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }));
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: 'body must be an object' });
    });
  }
});
