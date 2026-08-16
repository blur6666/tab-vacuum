/**
 * Does the Vacuum confirm still "list the tabs it will take" (CLAUDE.md rule 2)
 * when there are a lot of them, inside a real extension popup?
 *
 * Chrome caps popups at 800x600. The list is .detail-list — max-height 150px,
 * overflow-y auto — so the question is whether that reads as a list or as a
 * peephole, and whether the button you must press stays reachable.
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
const JUNK_COUNT = 18; // new tabs
const DUPE_COUNT = 14; // extra copies of one url

const server = createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end('<!doctype html><title>Busy Page</title><h1>Busy Page</h1>');
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}`;

const PROFILE = mkdtempSync(join(tmpdir(), 'tabvac-size-'));
const ctx = await chromium.launchPersistentContext(PROFILE, {
  executablePath: CHROME,
  headless: true,
  // A real extension popup, not a tab.
  viewport: { width: 350, height: 600 },
  args: [`--disable-extensions-except=${REPO}`, `--load-extension=${REPO}`, '--no-proxy-server'],
});

const probe = await ctx.newPage();
await probe.goto('chrome://extensions-internals/');
const list = JSON.parse(await probe.evaluate(() => document.body.innerText));
const me = list.find((e) => e.name === 'Tab Vacuum' || e.name === 'Tab Cleanup');
await probe.close();

for (let i = 0; i < JUNK_COUNT; i++) {
  const p = await ctx.newPage();
  await p.goto('chrome://newtab/');
}
for (let i = 0; i < DUPE_COUNT + 1; i++) {
  const p = await ctx.newPage();
  await p.goto(`${BASE}/busy`);
}

const popup = await ctx.newPage();
await popup.setViewportSize({ width: 350, height: 600 });
await popup.goto(`chrome-extension://${me.id}/src/popup/popup.html`);

const vacuum = popup.locator('#vacuum');
await vacuum.click();
await popup.waitForTimeout(900);

console.log('armed label     :', JSON.stringify((await vacuum.textContent()).trim()));

const m = await popup.locator('#vacuum-list').evaluate((el) => {
  const cs = getComputedStyle(el);
  return {
    rows: el.children.length,
    clientHeight: el.clientHeight,
    scrollHeight: el.scrollHeight,
    maxHeight: cs.maxHeight,
    overflowY: cs.overflowY,
  };
});
const rowH = m.rows ? Math.round(m.scrollHeight / m.rows) : 0;

console.log('rows in list    :', m.rows);
console.log('list box        :', `${m.clientHeight}px visible of ${m.scrollHeight}px content`);
console.log('max-height      :', m.maxHeight, '| overflow-y:', m.overflowY);
console.log('rows visible    :', rowH ? Math.floor(m.clientHeight / rowH) : '?', 'of', m.rows);
console.log('scrollable      :', m.scrollHeight > m.clientHeight);

const doc = await popup.evaluate(() => ({
  bodyH: document.body.scrollHeight,
  viewportH: window.innerHeight,
}));
console.log('page height     :', doc.bodyH, 'vs popup cap', doc.viewportH);

const btn = await vacuum.boundingBox();
console.log('button bottom   :', Math.round(btn.y + btn.height), '(must stay under 600)');
console.log('button in view  :', await vacuum.isVisible());

await popup.screenshot({ path: join(OUT, 'armed-many.png') });

await ctx.close();
server.close();
