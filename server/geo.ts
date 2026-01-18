import { getHeader } from './http.js';

function decodeIfNeeded(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const normalized = value.replace(/\+/g, '%20');
    return decodeURIComponent(normalized);
  } catch {
    return value;
  }
}

export function getVercelGeo(req: any) {
  return {
    city: decodeIfNeeded(getHeader(req, 'x-vercel-ip-city')),
    region: decodeIfNeeded(getHeader(req, 'x-vercel-ip-country-region')),
    country: decodeIfNeeded(getHeader(req, 'x-vercel-ip-country')),
    timezone: decodeIfNeeded(getHeader(req, 'x-vercel-ip-timezone')),
    latitude: decodeIfNeeded(getHeader(req, 'x-vercel-ip-latitude')),
    longitude: decodeIfNeeded(getHeader(req, 'x-vercel-ip-longitude')),
    postalCode: decodeIfNeeded(getHeader(req, 'x-vercel-ip-postal-code')),
    asn: decodeIfNeeded(getHeader(req, 'x-vercel-ip-asn')),
    asName: decodeIfNeeded(getHeader(req, 'x-vercel-ip-as-name')),
  };
}
