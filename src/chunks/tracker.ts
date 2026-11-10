/**
 * Entry for the drop-in <script> tag served by the collector:
 *
 *   <script defer src="/api/collect" data-replay="0.25"></script>
 *
 * The collector URL is taken from the script's own src. Options come from data attributes.
 */
import { initDossier, optIn, optOut, type DossierOptions } from '../client/index.js';

declare global {
  interface Window {
    dossier?: ReturnType<typeof initDossier> & { optIn: typeof optIn };
  }
}

const el = document.currentScript as HTMLScriptElement | null;
if (el && !window.dossier) {
  const d = el.dataset;
  const endpoint = new URL(el.src, location.href);
  endpoint.search = '';
  const opts: DossierOptions = {
    endpoint: endpoint.origin === location.origin ? endpoint.pathname : endpoint.toString(),
  };
  if (d.replay) opts.replay = Math.max(0, Math.min(1, Number(d.replay) || 0));
  if (d.fingerprint === 'true' || d.fingerprint === '') opts.fingerprint = true;
  if (d.sections) opts.sections = d.sections === 'false' ? false : d.sections;
  if (d.linkParam) opts.linkParam = d.linkParam.split(',').map((s) => s.trim());
  if (d.respectPrivacySignals === 'false') opts.respectPrivacySignals = false;
  if (d.persist === 'cookie') opts.persist = 'cookie';
  window.dossier = Object.assign(initDossier(opts), { optIn });
} else if (!window.dossier) {
  window.dossier = Object.assign(initDossier(), { optIn, optOut });
}
