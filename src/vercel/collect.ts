import { createCollectHandler } from '../server/collect.js';

/** Vercel Function: `export { default } from '@trevor050/dossier/vercel/collect'` in `api/collect.ts`. */
export default { fetch: createCollectHandler() };
