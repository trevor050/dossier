export type BotInput = {
  userAgent?: string | null;
  acceptLanguage?: string | null;
  activeSeconds?: number | null;
  idleSeconds?: number | null;
  sessionSeconds?: number | null;
  interactions?: number | null;
  /** `navigator.webdriver` as reported by the tracker. */
  webdriver?: boolean;
  /** Network owner (from IP enrichment), e.g. "AS16509 Amazon.com, Inc.". */
  org?: string | null;
  /** True when this IP opened an unusual number of sessions in the last minute. */
  highVelocity?: boolean;
};

export type BotVerdict = { score: number; reasons: string[]; isBot: boolean };

const UA_RULES: Array<[RegExp, number, string]> = [
  [/vercel-(screenshot|favicon)/i, 6, 'vercel preview'],
  [/headlesschrome|headless/i, 6, 'headless browser'],
  [/lighthouse|pagespeed|gtmetrix|pingdom|uptimerobot|statuscake/i, 6, 'monitoring/audit'],
  [/phantomjs|puppeteer|playwright|selenium|cypress/i, 6, 'automation framework'],
  [
    /googlebot|bingbot|duckduckbot|baiduspider|yandex(bot)?|applebot|petalbot|semrush|ahrefs|mj12bot|dotbot|bytespider|gptbot|claudebot|ccbot|perplexitybot/i,
    6,
    'search/AI crawler',
  ],
  [/facebookexternalhit|slackbot|linkedinbot|twitterbot|discordbot|telegrambot|whatsapp|skypeuripreview/i, 6, 'link preview'],
  [/\bbot\b|crawl|spider|scrape/i, 4, 'bot-like user agent'],
  [/curl|wget|python-requests|python-urllib|httpclient|go-http-client|node-fetch|axios|okhttp|java\//i, 6, 'http client'],
];

const DATACENTER_RE =
  /amazon|aws|google cloud|google llc|microsoft|azure|digitalocean|hetzner|ovh|linode|akamai|vultr|oracle|alibaba|tencent|scaleway|contabo|leaseweb|choopa|m247|datacamp|hostinger|cloudflare/i;

/** Additive heuristic score. Anything at or above `threshold` is treated as a bot. */
export function computeBotScore(input: BotInput, threshold = 6): BotVerdict {
  const reasons: string[] = [];
  let score = 0;
  const add = (pts: number, reason: string) => {
    score += pts;
    reasons.push(reason);
  };

  const ua = input.userAgent ?? '';
  if (!ua.trim()) add(4, 'empty user agent');
  for (const [re, pts, label] of UA_RULES) {
    if (re.test(ua)) {
      add(pts, label);
      break; // one UA verdict is enough; rules are ordered most specific first
    }
  }

  if (input.webdriver) add(6, 'navigator.webdriver');
  if (!input.acceptLanguage) add(1, 'no accept-language');
  if (input.highVelocity) add(6, 'request velocity');
  if (input.org && DATACENTER_RE.test(input.org)) add(3, 'datacenter network');

  if (typeof input.activeSeconds === 'number' && typeof input.interactions === 'number') {
    if (input.activeSeconds <= 1 && input.interactions === 0) add(2, 'no interaction');
  }

  if (
    typeof input.idleSeconds === 'number' &&
    typeof input.sessionSeconds === 'number' &&
    input.sessionSeconds >= 10 &&
    input.idleSeconds / input.sessionSeconds >= 0.95
  ) {
    add(1, 'mostly idle');
  }

  return { score, reasons, isBot: score >= threshold };
}
