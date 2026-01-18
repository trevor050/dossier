const DEFAULT_MAX_BODY_BYTES = 100_000;

export function getHeader(req: any, name: string): string | undefined {
  const value = req.headers?.[name] ?? req.headers?.[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}

export function safeHostFromUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    return new URL(url).host;
  } catch {
    return undefined;
  }
}

export async function readRawBody(req: any, maxBytes = DEFAULT_MAX_BODY_BYTES): Promise<string> {
  return await new Promise((resolve, reject) => {
    let size = 0;
    let data = '';

    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > maxBytes) {
        reject(new Error('Body too large'));
        req.destroy();
        return;
      }
      data += chunk.toString('utf8');
    });

    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

export function getClientIp(req: any): string | undefined {
  const forwardedFor = getHeader(req, 'x-forwarded-for');
  if (forwardedFor) return forwardedFor.split(',')[0]?.trim();
  return getHeader(req, 'x-real-ip');
}

export function sameSiteRequest(req: any): boolean {
  const secFetchSite = getHeader(req, 'sec-fetch-site');
  if (!secFetchSite) return false;
  return secFetchSite === 'same-origin' || secFetchSite === 'same-site';
}

export function allowedHosts(req: any): Set<string> {
  const allowed = new Set<string>();

  const vercelUrl = process.env.VERCEL_URL;
  if (vercelUrl) allowed.add(vercelUrl);

  const custom = process.env.REPORT_ALLOWED_HOSTS;
  if (custom) {
    for (const host of custom.split(',').map((h) => h.trim()).filter(Boolean)) {
      allowed.add(host);
    }
  }

  const hostHeader = getHeader(req, 'host');
  if (hostHeader) allowed.add(hostHeader);

  allowed.add('localhost:5173');
  allowed.add('localhost:4173');
  allowed.add('localhost:3000');

  return allowed;
}

