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

// Look like a normal browser. The UA has to be set at launch: headless Chromium sends
// beacons with its own "HeadlessChrome" UA regardless of context overrides, and the
// collector (correctly) treats that as a bot. The bot check below uses a plain launch.
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const browser = await chromium.launch({ args: [`--user-agent=${UA}`, '--lang=en-US'] });
const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'en-US', userAgent: UA });
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

// A second page load in the same visit (full navigation, same session). Its summary must add to the
// first page's, not replace it. The first page's summary goes out in its pagehide beacon.
await page.goto(`${base}/?part=2`, { waitUntil: 'networkidle' });
await page.mouse.move(200, 200);
await page.evaluate(() => document.getElementById('about').scrollIntoView());
await page.mouse.move(250, 260);
await page.waitForTimeout(3000);
await page.mouse.move(260, 280);
await page.waitForTimeout(2000);
await page.goto('about:blank'); // pagehide -> summary beacon for page 2
await page.waitForTimeout(1500);
await browser.close();

// A plain headless visit should be filtered as a bot.
const botTag = `${tag}-bot`;
const botBrowser = await chromium.launch();
const botPage = await (await botBrowser.newContext()).newPage();
await botPage.goto(`${base}/?to=${botTag}`, { waitUntil: 'networkidle' });
await botPage.waitForTimeout(1000);
await botPage.goto('about:blank');
await botPage.waitForTimeout(1000);
await botBrowser.close();

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
  console.log(`clicks: ${detail.clicks.map((c) => `${c.label}×${c.count}`).join(', ')}`);
  console.log(`pages: ${s.pages.join(' -> ')} · visit active ${s.active_seconds}s`);
  if (detail.sessions.length !== 1) fail(`expected one visit across both page loads, got ${detail.sessions.length}`);
  if (!(s.pages.includes('/?keep=1') && s.pages.includes('/?part=2'))) fail(`page list lost a page: ${JSON.stringify(s.pages)}`);
  if (!detail.attention.some((d) => d.key === 'about')) fail('second page sections missing');
  if (detail.clicks.some((c) => c.count > 1)) fail('a single click was counted more than once');
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
