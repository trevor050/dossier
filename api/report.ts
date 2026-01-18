const MAX_BODY_BYTES = 10_000;
const ALLOWED_EVENTS = new Set(['visit', 'session_end']);

function getHeader(req: any, name: string): string | undefined {
  const value = req.headers?.[name] ?? req.headers?.[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}

function getClientIp(req: any): string | undefined {
  const forwardedFor = getHeader(req, 'x-forwarded-for');
  if (forwardedFor) return forwardedFor.split(',')[0]?.trim();
  return getHeader(req, 'x-real-ip');
}

function decodeIfNeeded(value: string | undefined): string | undefined {
  if (!value) return undefined;
  // Vercel geo headers sometimes arrive URL-encoded (e.g. "San%20Jose").
  try {
    const normalized = value.replace(/\+/g, '%20');
    return decodeURIComponent(normalized);
  } catch {
    return value;
  }
}

function getVercelGeo(req: any) {
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

function safeHostFromUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    return new URL(url).host;
  } catch {
    return undefined;
  }
}

function getAllowedHosts(req: any): Set<string> {
  const allowed = new Set<string>();

  const vercelUrl = process.env.VERCEL_URL;
  if (vercelUrl) allowed.add(vercelUrl);

  const custom = process.env.REPORT_ALLOWED_HOSTS;
  if (custom) {
    for (const host of custom.split(',').map((h) => h.trim()).filter(Boolean)) {
      allowed.add(host);
    }
  }

  // Allow current host header too (covers custom domains without config).
  const hostHeader = getHeader(req, 'host');
  if (hostHeader) allowed.add(hostHeader);

  // Local dev
  allowed.add('localhost:5173');
  allowed.add('localhost:4173');
  allowed.add('localhost:3000');

  return allowed;
}

async function readRawBody(req: any): Promise<string> {
  return await new Promise((resolve, reject) => {
    let size = 0;
    let data = '';
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
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

function formatDiscordMessage(payload: any, req: any) {
  const geo = getVercelGeo(req);
  const ua = getHeader(req, 'user-agent');
  const ip = getClientIp(req);
  const vercelId = getHeader(req, 'x-vercel-id');
  const acceptLang = getHeader(req, 'accept-language');

  const locationBits = [geo.city, geo.region, geo.country].filter(Boolean);
  const location = locationBits.length ? locationBits.join(', ') : 'Unknown';

  const event = typeof payload?.event === 'string' ? payload.event : 'visit';
  const page = typeof payload?.page === 'string' ? payload.page : undefined;
  const referrer = typeof payload?.referrer === 'string' ? payload.referrer : undefined;
  const isMobile = typeof payload?.is_mobile === 'boolean' ? payload.is_mobile : undefined;
  const orientation = typeof payload?.orientation === 'string' ? payload.orientation : undefined;
  const sid = typeof payload?.sid === 'string' ? payload.sid : undefined;
  const vid = typeof payload?.vid === 'string' ? payload.vid : undefined;
  const overlays = Array.isArray(payload?.overlays) ? payload.overlays : undefined;
  const firstInteractionSeconds =
    typeof payload?.first_interaction_seconds === 'number' ? payload.first_interaction_seconds : null;
  const overlaysUnique = typeof payload?.overlays_unique === 'number' ? payload.overlays_unique : undefined;

  const visitorShort = vid ? vid.split('-')[0] ?? vid.slice(0, 8) : undefined;
  const sessionShort = sid ? sid.split('-')[0] ?? sid.slice(0, 8) : undefined;

  const device = typeof isMobile === 'boolean' ? (isMobile ? 'Mobile' : 'Desktop') : 'Unknown';
  const langShort = acceptLang ? acceptLang.split(',')[0]?.trim() : undefined;
  const refHost = safeHostFromUrl(referrer);

  const title = event === 'session_end' ? 'Session end' : 'Visit';

  const descriptionLines: string[] = [];
  if (ip) descriptionLines.push(`**IP:** \`${ip}\``);
  descriptionLines.push(`**Loc:** ${location}`);
  if (geo.timezone) descriptionLines.push(`**TZ:** ${geo.timezone}`);
  if (geo.asn || geo.asName) descriptionLines.push(`**Net:** ${[geo.asn, geo.asName].filter(Boolean).join(' ')}`);
  descriptionLines.push(`**Device:** ${device}${orientation ? ` (${orientation})` : ''}`);
  if (langShort) descriptionLines.push(`**Lang:** ${langShort}`);
  if (page && page !== '/') descriptionLines.push(`**Page:** ${page}`);
  if (refHost) descriptionLines.push(`**Ref:** ${refHost}`);

  const fields: { name: string; value: string; inline?: boolean }[] = [];

  // Include some session summary details if provided (no IP included).
  if (event === 'session_end') {
    const seconds = typeof payload?.active_seconds === 'number' ? payload.active_seconds : undefined;
    const interactions = typeof payload?.interactions === 'number' ? payload.interactions : undefined;
    const summaryBits: string[] = [];
    if (typeof seconds === 'number') summaryBits.push(`active \`${seconds}s\``);
    if (typeof interactions === 'number') summaryBits.push(`interactions \`${interactions}\``);
    if (firstInteractionSeconds != null) summaryBits.push(`first action \`${firstInteractionSeconds}s\``);
    if (typeof overlaysUnique === 'number') summaryBits.push(`sections \`${overlaysUnique}\``);
    if (summaryBits.length) fields.push({ name: 'Summary', value: summaryBits.join(' • '), inline: false });

    if (Array.isArray(overlays) && overlays.length) {
      const compact = overlays
        .slice(0, 6)
        .map((o: any) => {
          const key = typeof o?.key === 'string' ? o.key : 'unknown';
          const s = typeof o?.seconds === 'number' ? o.seconds : undefined;
          return s != null ? `${key} (${s}s)` : key;
        })
        .join(', ');
      fields.push({ name: 'Overlays', value: compact, inline: false });
    }
  }

  return {
    content: null,
    embeds: [
      {
        title,
        color: 0xffd700,
        timestamp: new Date().toISOString(),
        description: descriptionLines.join('\n'),
        fields,
        footer: {
          text: [
            visitorShort ? `vid:${visitorShort}` : null,
            sessionShort ? `sid:${sessionShort}` : null,
            geo.postalCode ? `postal:${geo.postalCode}` : null,
            vercelId ? `vercel:${vercelId.split('::').pop()}` : null,
            ua ? `ua:${ua.slice(0, 120)}` : null,
          ]
            .filter(Boolean)
            .join(' • '),
        },
      },
    ],
  };
}

function botScore(req: any, payload: any): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  let score = 0;

  const ua = (getHeader(req, 'user-agent') ?? '').toLowerCase();
  const acceptLang = getHeader(req, 'accept-language');

  const uaRules: Array<[RegExp, number, string]> = [
    [/vercel-screenshot/i, 6, 'vercel-screenshot'],
    [/headless/i, 5, 'headless'],
    [/\bbot\b|\bcrawl\b|\bspider\b/i, 4, 'bot/crawler'],
    [/curl|wget|python-requests|httpclient|go-http-client/i, 4, 'http-client'],
  ];

  for (const [re, pts, label] of uaRules) {
    if (re.test(ua)) {
      score += pts;
      reasons.push(label);
    }
  }

  if (!acceptLang) {
    score += 1;
    reasons.push('no accept-language');
  }

  const event = payload?.event;
  if (event === 'session_end') {
    const seconds = typeof payload?.active_seconds === 'number' ? payload.active_seconds : 0;
    const interactions = typeof payload?.interactions === 'number' ? payload.interactions : 0;
    if (seconds <= 1 && interactions === 0) {
      score += 2;
      reasons.push('0-interaction short session');
    }
  }

  return { score, reasons };
}

// Basic in-memory rate limit (best-effort, not persistent across serverless instances).
const bucket = new Map<string, { count: number; resetAt: number }>();
function rateLimitKey(req: any, payload: any): string {
  const ip = getClientIp(req) ?? 'unknown';
  const sessionId = typeof payload?.sid === 'string' ? payload.sid.slice(0, 64) : 'no-sid';
  return `${ip}:${sessionId}`;
}

function shouldAllow(req: any, payload: any): boolean {
  const now = Date.now();
  const key = rateLimitKey(req, payload);
  const windowMs = 60_000;
  const max = 6; // per minute

  const current = bucket.get(key);
  if (!current || current.resetAt <= now) {
    bucket.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }

  current.count += 1;
  bucket.set(key, current);
  return current.count <= max;
}

export default async function handler(req: any, res: any) {
  try {
    if (req.method !== 'POST') {
      res.statusCode = 405;
      res.setHeader('Allow', 'POST');
      res.end('Method Not Allowed');
      return;
    }

    const primaryWebhookUrl = process.env.DISCORD_WEBHOOK_URL;
    const botWebhookUrl = process.env.DISCORD_BOT_WEBHOOK_URL;
    if (!primaryWebhookUrl && !botWebhookUrl) {
      // If not configured, don't break the site.
      res.statusCode = 204;
      res.end();
      return;
    }

    // Basic origin/referrer gating (not bulletproof, but reduces casual spam).
    const originHost = safeHostFromUrl(getHeader(req, 'origin'));
    const refererHost = safeHostFromUrl(getHeader(req, 'referer'));
    const allowedHosts = getAllowedHosts(req);
    const hostOk = (originHost && allowedHosts.has(originHost)) || (refererHost && allowedHosts.has(refererHost));
    if (!hostOk) {
      res.statusCode = 403;
      res.end('Forbidden');
      return;
    }

    const raw = await readRawBody(req);
    let payload: any = {};
    try {
      payload = raw ? JSON.parse(raw) : {};
    } catch {
      payload = {};
    }

    const event = payload?.event;
    if (typeof event !== 'string' || !ALLOWED_EVENTS.has(event)) {
      res.statusCode = 400;
      res.end('Bad Request');
      return;
    }

    if (!shouldAllow(req, payload)) {
      res.statusCode = 429;
      res.end('Too Many Requests');
      return;
    }

    const bot = botScore(req, payload);
    const targetWebhookUrl = bot.score >= 6 && botWebhookUrl ? botWebhookUrl : primaryWebhookUrl;
    if (!targetWebhookUrl) {
      res.statusCode = 204;
      res.end();
      return;
    }

    const discordBody = formatDiscordMessage(payload, req);
    if (bot.score >= 6) {
      discordBody.embeds[0].title = 'Possible bot visit';
      discordBody.embeds[0].color = 0xe11d48;
      discordBody.embeds[0].fields.unshift({ name: 'Bot score', value: `${bot.score} (${bot.reasons.join(', ') || 'n/a'})`, inline: false });
    }

    const send = async (url: string) => {
      return await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(discordBody),
      });
    };

    // Best-effort: never error the site if Discord rejects/ratelimits.
    // Route suspected bots to the bot webhook when configured.
    // (No fallback for bots, so they stay separated from the main channel.)
    await send(targetWebhookUrl);

    res.statusCode = 204;
    res.end();
  } catch {
    res.statusCode = 500;
    res.end('Internal Server Error');
  }
}
