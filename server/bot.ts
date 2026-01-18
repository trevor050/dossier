export function computeBotScore(input: {
  userAgent?: string;
  acceptLanguage?: string;
  activeSeconds?: number | null;
  idleSeconds?: number | null;
  sessionSeconds?: number | null;
  interactions?: number | null;
}): { score: number; reasons: string[]; isBot: boolean } {
  const reasons: string[] = [];
  let score = 0;

  const ua = (input.userAgent ?? '').toLowerCase();

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

  if (!input.acceptLanguage) {
    score += 1;
    reasons.push('no accept-language');
  }

  if (typeof input.activeSeconds === 'number' && typeof input.interactions === 'number') {
    if (input.activeSeconds <= 1 && input.interactions === 0) {
      score += 2;
      reasons.push('0-interaction short session');
    }
  }

  // Very high idle share is often non-human (tab left open / automation).
  if (typeof input.idleSeconds === 'number' && typeof input.sessionSeconds === 'number' && input.sessionSeconds > 0) {
    const idleShare = input.idleSeconds / input.sessionSeconds;
    if (idleShare >= 0.95 && input.sessionSeconds >= 10) {
      score += 1;
      reasons.push('mostly idle');
    }
  }

  const threshold = Number(process.env.BOT_SCORE_THRESHOLD ?? 6);
  const isBot = score >= (Number.isFinite(threshold) ? threshold : 6);
  return { score, reasons, isBot };
}
