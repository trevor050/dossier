import { createCollectHandler } from '../server/collect.js';

const collect = createCollectHandler();

/**
 * Compatibility shim for Dossier 0.1 setups that had a separate `api/replay.ts`.
 * New setups send replay chunks to `/api/collect?kind=replay` and do not need this file.
 */
export default {
  fetch(req: Request) {
    const url = new URL(req.url, 'http://localhost');
    if (req.method === 'POST' && !url.searchParams.has('kind')) url.searchParams.set('kind', 'replay');
    return collect(new Request(url, req));
  },
};
