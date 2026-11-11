// Lazy chunk served at `<collector>?asset=recorder`. Only loaded for sampled sessions.
import { record } from '@rrweb/record';

window.__dossierRecord = record as unknown as Window['__dossierRecord'];
