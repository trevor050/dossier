const OPT_OUT_KEY = 'dossier_opt_out';
export const OPT_PARAM = 'dossier';

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** True when the browser sends Global Privacy Control or Do Not Track. */
export function privacySignal(nav: Navigator = navigator, win: Window = window): boolean {
  const n = nav as Navigator & { globalPrivacyControl?: boolean; msDoNotTrack?: string };
  const w = win as Window & { doNotTrack?: string };
  if (n.globalPrivacyControl === true) return true;
  const dnt = n.doNotTrack ?? w.doNotTrack ?? n.msDoNotTrack;
  return dnt === '1' || dnt === 'yes';
}

export function isOptedOut(): boolean {
  return storage()?.getItem(OPT_OUT_KEY) === '1';
}

/** Stop tracking this browser on this site, permanently (until `optIn()`). */
export function optOut(): void {
  storage()?.setItem(OPT_OUT_KEY, '1');
}

export function optIn(): void {
  storage()?.removeItem(OPT_OUT_KEY);
}

/** Apply `?dossier=off` / `?dossier=on` from the URL. Returns true when the param was present. */
export function applyOptParam(url: URL): boolean {
  const v = url.searchParams.get(OPT_PARAM);
  if (v == null) return false;
  if (['off', '0', 'false', 'out'].includes(v.toLowerCase())) optOut();
  else if (['on', '1', 'true', 'in'].includes(v.toLowerCase())) optIn();
  return true;
}
