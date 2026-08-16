/**
 * Verifies the Vacuum confirm in a real browser.
 *
 * Throw-away profile only, per CLAUDE.md ("Never point an automated run at the
 * real profile"), and a local http server rather than the internet — the
 * container has no outbound browser network, and duplicate detection needs a
 * real http: scheme, which data: URLs cannot give.
 */
import { createServer } from 'node:http';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';

import { dirname, join } from 'node:path';
import { mkdirSync } from 'node:fs';

// Repo root, so the script runs from anywhere.
const REPO = dirname(dirname(import.meta.dirname));
// Playwright's bundled chromium moves with its version; override when needed.
const CHROME = process.env.TABVAC_CHROME ?? '/opt/pw-browsers/chromium/chrome-linux/chrome';
// tmp/ is gitignored.
const OUT = join(REPO, 'tmp');
mkdirSync(OUT, { recursive: true });

import { createRequire } from 'node:module';

/**
 * Resolve playwright from the *invoking* directory, not from this file.
 *
 * ESM `import` resolves relative to the module's own path, and this repo has no
 * node_modules on purpose — so a plain import can never find a playwright
 * installed outside the repo, which is exactly how README.md says to install
 * it. createRequire against cwd is what makes that instruction true.
 */
const requireFromCwd = createRequire(join(process.cwd(), 'noop.cjs'));
let chromium;
try {
  ({ chromium } = requireFromCwd('playwright'));
} catch {
  console.error(
    'playwright not found.\n' +
      'Install it outside this repo, then run from there:\n' +
      '  mkdir -p ~/pw && cd ~/pw && npm init -y && npm install playwright\n' +
      `  node ${process.argv[1]}`,
  );
  process.exit(1);
}

// --- local pages -----------------------------------------------------------
const PAGES = {
  '/article': 'Interesting Article',
  '/unique': 'Only Copy',
  // Decoys: the removed title/path rules would have closed every one of these.
  '/issues/12': 'Fix 404 on /docs page',
  '/news': 'Server Error rates spike across the web',
  '/checkout/complete': 'Order #A1234 confirmed',
  '/login': 'Sign in',
};

const server = createServer((req, res) => {
  const path = req.url.split('?')[0];
  const title = PAGES[path] ?? 'Untitled';
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end(`<!doctype html><html><head><title>${title}</title></head><body><h1>${title}</h1></body></html>`);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}`;
console.log('local server:', BASE);

// --- browser ---------------------------------------------------------------
const PROFILE = mkdtempSync(join(tmpdir(), 'tabvac-throwaway-'));
console.log('throw-away profile:', PROFILE);

const ctx = await chromium.launchPersistentContext(PROFILE, {
  executablePath: CHROME,
  headless: true,
  viewport: null,
  args: [
    `--disable-extensions-except=${REPO}`,
    `--load-extension=${REPO}`,
    '--no-proxy-server', // everything under test is on loopback
  ],
});

const probe = await ctx.newPage();
await probe.goto('chrome://extensions-internals/');
const parsed = JSON.parse(await probe.evaluate(() => document.body.innerText));
const me = parsed.find((e) => e.name === 'Tab Vacuum' || e.name === 'Tab Cleanup');
if (!me) throw new Error(`extension not loaded; saw ${parsed.map((e) => e.name)}`);
console.log('extension id:', me.id, '| manifest name:', me.name);

async function open(url) {
  const p = await ctx.newPage();
  await p.goto(url, { waitUntil: 'load' });
  return p;
}

// Junk it SHOULD take
await open('chrome://newtab/');
await open('chrome://settings/');
// A genuine duplicate pair
await open(`${BASE}/article`);
await open(`${BASE}/article`);
// Things it MUST NOT take
await open(`${BASE}/unique`);
await open(`${BASE}/issues/12`);
await open(`${BASE}/news`);
await open(`${BASE}/checkout/complete`);
await open(`${BASE}/login`);

await probe.close();

// --- drive the popup -------------------------------------------------------
const popup = await ctx.newPage();
await popup.goto(`chrome-extension://${me.id}/src/popup/popup.html`);

const vacuum = popup.locator('#vacuum');
console.log('\nlabel before arming :', JSON.stringify((await vacuum.textContent()).trim()));

await vacuum.click();
await popup.waitForTimeout(800);

console.log('label armed         :', JSON.stringify((await vacuum.textContent()).trim()));
console.log('list visible        :', await popup.locator('#vacuum-list').isVisible());

const rows = await popup.locator('#vacuum-list li').allTextContents();
console.log('confirm lists:');
for (const r of rows) console.log('   •', r.trim());

await popup.screenshot({ path: join(OUT, 'armed.png'), fullPage: true });

// --- did any decoy get listed? --------------------------------------------
const FORBIDDEN = ['Fix 404', 'Server Error', 'Order #A1234', 'Sign in', 'Only Copy'];
const leaked = FORBIDDEN.filter((f) => rows.some((r) => r.includes(f)));
console.log('\ndecoys in the confirm:', leaked.length ? leaked : 'none  ✅');

// --- fire it ---------------------------------------------------------------
const titlesBefore = await Promise.all(ctx.pages().map((p) => p.title().catch(() => '?')));
await vacuum.click();
await popup.waitForTimeout(1500);
const titlesAfter = await Promise.all(ctx.pages().map((p) => p.title().catch(() => '?')));

console.log('\ntabs before:', titlesBefore.length, '| after:', titlesAfter.length);
console.log('survivors:');
for (const t of titlesAfter) console.log('   -', t);

const survived = FORBIDDEN.filter((f) => titlesAfter.some((t) => t.includes(f)));
console.log('\ndecoys that survived the close:', survived.length, 'of', FORBIDDEN.length);

await ctx.close();
server.close();
