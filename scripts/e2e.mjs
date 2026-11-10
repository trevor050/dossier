// End-to-end check against a running server that serves the sample site
// (`dossier demo`, or `dossier serve --sample`). Drives a real Chromium through the
// tracker, then reads the result back through the admin API.
// Usage: BASE=http://localhost:8787 [TOKEN=...] node scripts/e2e.mjs
import { chromium } from 'playwright-core';

const base = process.env.BASE ?? 'http://localhost:8787';
const tag = `e2e-${Date.now().toString(36)}`;
const headers = process.env.TOKEN ? { authorization: `Bearer ${process.env.TOKEN}` } : {};
const fail = (msg) => {
  console.error(`FAIL ${msg}`);
  process.exitCode = 1;
};

const browser = await chromium.launch();
// Look like a normal browser; the bot check below uses a plain headless context.
// (Headless Chromium sends beacons with its real UA, so the headers are forced for every request.)
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const context = await browser.newContext({
  viewport: { width: 1280, height: 800 },
  locale: 'en-US',
  userAgent: UA,
  extraHTTPHeaders: { 'user-agent': UA, 'accept-language': 'en-US,en;q=0.9' },
});
await context.route('**/api/collect**', (route) =>
  route.continue({ headers: { ...route.request().headers(), 'user-agent': UA, 'accept-language': 'en-US,en;q=0.9' } }),
);
await context.addInitScript(() => Object.defineProperty(navigator, 'webdriver', { get: () => false }));
const page = await context.newPage();
const posts = [];
page.on('request', (r) => r.method() === 'POST' && r.url().includes('/api/collect') && posts.push(r.url()));

await page.goto(`${base}/?to=${tag}&keep=1#top`, { waitUntil: 'networkidle' });
const url = page.url();
if (url.includes('to=')) fail(`link tag still in the address bar: ${url}`);
if (!url.includes('keep=1') || !url.endsWith('#top')) fail(`other params/hash were not preserved: ${url}`);

await page.mouse.move(300, 300);
await page.waitForTimeout(2500);
await page.evaluate(() => document.getElementById('projects').scrollIntoView());
await page.mouse.move(400, 320);
await page.waitForTimeout(3000);
await page.click('[data-track="project-orbit"]');
await page.evaluate(() => document.getElementById('experience').scrollIntoView());
await page.click('[data-track="open-resume"]');
await page.waitForTimeout(3000);
await page.click('dialog button');
await page.fill('input', 'secret@example.com');
await page.waitForTimeout(6000); // let the replay flush timer fire
// Send the summary explicitly, then detach the tracker: headless Chromium sends pagehide
// beacons with its real "HeadlessChrome" UA, which would (correctly) flag this visit as a bot.
await page.evaluate(() => window.dossier.flush());
await page.evaluate(() => window.dossier.optOut());
await page.goto('about:blank');
await page.waitForTimeout(500);

// A plain headless visit should be filtered as a bot.
const botTag = `${tag}-bot`;
const botPage = await (await browser.newContext()).newPage();
await botPage.goto(`${base}/?to=${botTag}`, { waitUntil: 'networkidle' });
await botPage.waitForTimeout(1000);
await botPage.goto('about:blank');
await botPage.waitForTimeout(1000);
await browser.close();

console.log(`collector POSTs: ${posts.length} (${posts.filter((u) => u.includes('kind=replay')).length} replay)`);

const get = async (route, params = {}) => {
  const qs = new URLSearchParams({ api: route, ...params });
  const res = await fetch(`${base}/api/admin?${qs}`, { headers });
  if (!res.ok) throw new Error(`${route}: HTTP ${res.status}`);
  return res.json();
};
const overview = await get('overview', { days: 1 });
const person = overview.people.find((p) => p.tags.includes(tag));
if (!person) {
  fail(`no person with tag ${tag} in overview`);
} else {
  const detail = await get('person', { id: person.id });
  const s = detail.sessions[0];
  console.log(`person: ${person.name} · ${person.visits} visit · ${person.active_seconds}s active`);
  console.log(`sections: ${detail.attention.map((d) => `${d.key}=${d.seconds}s`).join(', ')}`);
  console.log(`clicks: ${detail.clicks.map((c) => c.label).join(', ')}`);
  if (person.active_seconds < 5) fail('active time not recorded');
  for (const key of ['projects', 'resume']) if (!detail.attention.some((d) => d.key === key)) fail(`no dwell for ${key}`);
  if (!detail.clicks.some((c) => c.label === 'project-orbit')) fail('click not recorded');
  const session = await get('session', { sid: s.sid });
  console.log(`events: ${session.events.map((e) => e.type).join(', ')}`);
  console.log(`replay: ${session.replay.chunks} chunks, ${session.replay.bytes} bytes`);
  if (process.env.EXPECT_REPLAY !== '0' && session.replay.chunks === 0) fail('no replay recorded');
  if (session.replay.chunks) {
    const replay = await get('replay', { sid: s.sid });
    const raw = JSON.stringify(replay.events);
    if (raw.includes('secret@example.com')) fail('input value leaked into replay (masking failed)');
    else console.log('replay input masking: ok');
  }
}
const bots = await get('bots', { days: 1 });
const botVisit = bots.sessions.find((b) => (b.user_agent ?? '').includes('HeadlessChrome'));
if (!botVisit) fail('headless visit was not classified as a bot');
else console.log(`bot filtered: ${botVisit.reasons}`);
const humans = await get('overview', { days: 1 });
if (humans.people.some((p) => p.tags.includes(botTag))) fail('bot visit leaked into People');

console.log(process.exitCode ? 'E2E FAILED' : 'E2E OK');
