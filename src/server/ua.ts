export type DeviceInfo = {
  browser: string | null;
  os: string | null;
  type: 'mobile' | 'tablet' | 'desktop';
};

const BROWSERS: Array<[RegExp, string]> = [
  [/edg(e|a|ios)?\//i, 'Edge'],
  [/opr\/|opera/i, 'Opera'],
  [/samsungbrowser/i, 'Samsung Internet'],
  [/firefox|fxios/i, 'Firefox'],
  [/crios|chrome|chromium/i, 'Chrome'],
  [/safari/i, 'Safari'],
];

const SYSTEMS: Array<[RegExp, string]> = [
  [/iphone|ipod/i, 'iOS'],
  [/ipad/i, 'iPadOS'],
  [/android/i, 'Android'],
  [/cros/i, 'ChromeOS'],
  [/mac os x|macintosh/i, 'macOS'],
  [/windows/i, 'Windows'],
  [/linux/i, 'Linux'],
];

/** Coarse, dependency-free user agent parsing. Good enough for "Chrome on macOS". */
export function parseUserAgent(ua: string | null | undefined): DeviceInfo {
  const s = ua ?? '';
  const browser = BROWSERS.find(([re]) => re.test(s))?.[1] ?? null;
  const os = SYSTEMS.find(([re]) => re.test(s))?.[1] ?? null;
  const type = /ipad|tablet/i.test(s) || (/android/i.test(s) && !/mobile/i.test(s))
    ? 'tablet'
    : /mobi|iphone|ipod|android/i.test(s)
      ? 'mobile'
      : 'desktop';
  return { browser, os, type };
}
