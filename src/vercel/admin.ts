import { createAdminHandler } from '../server/admin/handler.js';

/** Vercel Function: `export { default } from '@trevor050/dossier/vercel/admin'` in `api/admin.ts`. */
export default { fetch: createAdminHandler() };
