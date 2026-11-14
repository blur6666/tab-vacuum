/**
 * Verifies one-click Vacuum and its results in a real browser.
 *
 * Throw-away profile only, per CLAUDE.md ("Never point an automated run at the
 * real profile"), and a local http server rather than the internet — the
 * container has no outbound browser network, and duplicate detection needs a
 * real http: scheme, which data: URLs cannot give.
 */
import { createServer } from 'node:http';
import assert from 'node:assert/strict';
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
const me = parsed.find((e) => e.name === 'Tab Vacuum');
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
const titlesBefore = await Promise.all(ctx.pages().map((p) => p.title().catch(() => '?')));
await popup.locator('#scan').click();
await popup.locator('#results:not(.hidden)').waitFor();
await vacuum.click();
await popup.waitForFunction(() =>
  document.querySelector('#status').textContent.startsWith('Vacuum complete:'),
);
assert.equal(await popup.locator('#results').isVisible(), false, 'Vacuum hides an earlier scan report');
await popup.locator('#vacuum-outcome:not(.hidden)').waitFor();

const status = (await popup.locator('#status').textContent()).trim();
const reportedClosed = Number(status.match(/closed (\d+) tabs?/)[1]);
const rows = await popup.locator('#vacuum-outcome-list li').allTextContents();
console.log('\nstatus:', status);
console.log('results visible:', await popup.locator('#results').isVisible());
console.log('outcome rows:');
for (const row of rows) console.log('   ', row.trim());
await popup.screenshot({ path: join(OUT, 'vacuum-results.png'), fullPage: true });

// --- verify the actual outcome --------------------------------------------
const FORBIDDEN = ['Fix 404', 'Server Error', 'Order #A1234', 'Sign in', 'Only Copy'];
const titlesAfter = await Promise.all(ctx.pages().map((p) => p.title().catch(() => '?')));

console.log('\ntabs before:', titlesBefore.length, '| after:', titlesAfter.length);
console.log('survivors:');
for (const t of titlesAfter) console.log('   -', t);

const survived = FORBIDDEN.filter((f) => titlesAfter.some((t) => t.includes(f)));
if (survived.length !== FORBIDDEN.length) {
  throw new Error(`expected all decoys to survive, got ${survived.length}/${FORBIDDEN.length}`);
}
const closedRows = rows.filter((row) => row.startsWith('Closed:'));
if (closedRows.length !== reportedClosed) {
  throw new Error(`expected ${reportedClosed} closed-tab rows, got ${closedRows.length}`);
}
if (!closedRows.some((row) => row.includes('duplicate'))) {
  throw new Error('the closed-tab list does not identify a duplicate');
}
if (titlesAfter.filter((title) => title === 'Interesting Article').length !== 1) {
  throw new Error('Vacuum did not leave exactly one duplicate copy open');
}
if (titlesBefore.length - titlesAfter.length !== reportedClosed) {
  throw new Error(
    `reported ${reportedClosed} closed tabs, but tab count changed by ${titlesBefore.length - titlesAfter.length}`,
  );
}

await ctx.close();
server.close();
