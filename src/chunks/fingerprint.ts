// Lazy chunk served at `<collector>?asset=fingerprint`. Only loaded when `fingerprint: true`.
import FingerprintJS from '@fingerprintjs/fingerprintjs';

window.__dossierFingerprint = FingerprintJS as unknown as Window['__dossierFingerprint'];
