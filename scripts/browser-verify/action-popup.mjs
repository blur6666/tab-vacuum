/** Real toolbar popup regression: a normal tab cannot reproduce dismissal. */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';

const { chromium } = createRequire(join(process.cwd(), 'noop.cjs'))('playwright');
const repo = dirname(dirname(import.meta.dirname));
const context = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), 'tabvac-action-')), {
  executablePath: process.env.TABVAC_CHROME,
  headless: false,
  viewport: null,
  args: [`--disable-extensions-except=${repo}`, `--load-extension=${repo}`, '--no-first-run'],
});

try {
  const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
  const extensionId = new URL(worker.url()).host;
  const popupUrl = `chrome-extension://${extensionId}/src/popup/popup.html`;
  const keeper = context.pages()[0];
  await keeper.goto(`chrome-extension://${extensionId}/src/review/review.html`);
  const junk = await context.newPage();
  await junk.goto('chrome://newtab/');
  await junk.bringToFront();

  await worker.evaluate(() => { globalThis.testLogs = []; console.warn = (...args) => globalThis.testLogs.push(args.map(String)); });
  const cdp = await context.browser().newBrowserCDPSession();
  await worker.evaluate(() => chrome.action.openPopup());
  async function findPopup(exclude) {
    const deadline = Date.now() + 10000;
    while (Date.now() < deadline) {
      const { targetInfos } = await cdp.send('Target.getTargets');
      const target = targetInfos.find((target) => target.url === popupUrl && target.targetId !== exclude);
      if (target) return target.targetId;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    console.log('state', await keeper.evaluate(() => chrome.runtime.sendMessage({type:'vacuum-state'})));
    console.log('windows', await worker.evaluate(() => chrome.windows.getAll()));
    console.log('logs', await worker.evaluate(() => globalThis.testLogs));
    console.log('targets', await cdp.send('Target.getTargets'));
    throw new Error('Toolbar popup did not appear');
  }
  async function attach(targetId) {
    const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: false });
    let nextId = 0;
    const pending = new Map();
    cdp.on('Target.receivedMessageFromTarget', (event) => {
      if (event.sessionId !== sessionId) return;
      const message = JSON.parse(event.message);
      const request = pending.get(message.id);
      if (request) {
        pending.delete(message.id);
        message.error ? request.reject(new Error(message.error.message)) : request.resolve(message.result);
      }
    });
    const send = (method, params = {}) => new Promise((resolve, reject) => {
      const id = ++nextId;
      pending.set(id, { resolve, reject });
      cdp.send('Target.sendMessageToTarget', { sessionId, message: JSON.stringify({ id, method, params }) }).catch(reject);
    });
    return { send, evaluate: async (expression) => {
      const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
      return result.result.value;
    } };
  }
  const firstId = await findPopup();
  const popup = await attach(firstId);
  const initialHeight = await popup.evaluate('document.body.scrollHeight');
  // Dispatch input without pinning the popup open with an inspector.
  const rect = await popup.evaluate(`(() => { const r = document.querySelector('#vacuum').getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2}; })()`);
  await popup.send('Input.dispatchMouseEvent', { type: 'mousePressed', ...rect, button: 'left', clickCount: 1 });
  await popup.send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...rect, button: 'left', clickCount: 1 });
  const replacementId = await findPopup(firstId);
  const replacement = await attach(replacementId);
  let report;
  const deadline = Date.now() + 10000;
  do {
    report = await replacement.evaluate(`({ status: document.querySelector('#status')?.textContent, rows: [...document.querySelectorAll('#vacuum-outcome-list li')].map(li=>li.textContent), height: document.body?.scrollHeight })`);
    if (report.status?.startsWith('Vacuum complete:')) break;
    await new Promise((resolve) => setTimeout(resolve, 50));
  } while (Date.now() < deadline);
  assert.ok(report.status.startsWith('Vacuum complete:'), JSON.stringify(report));
  assert.equal(await replacement.evaluate("getComputedStyle(document.querySelector('#results')).display"), 'none', 'Vacuum does not show the scan breakdown');
  assert.equal(await replacement.evaluate("document.querySelector('#scan').textContent"), 'Scan my tabs', 'Vacuum does not turn Scan into Scan again');
  assert.ok(junk.isClosed(), 'active new tab was removed immediately');
  assert.ok(report.rows.some((row) => row.startsWith('Closed:') && row.includes('unused new tab')));
  assert.ok(report.height > initialHeight, 'popup expands to show completed results');
  assert.ok(!keeper.isClosed(), 'unrelated extension review survives');
  mkdirSync(join(repo, 'tmp'), { recursive: true });
  const screenshot = await replacement.send('Page.captureScreenshot');
  writeFileSync(join(repo, 'tmp', 'action-popup-results.png'), Buffer.from(screenshot.data, 'base64'));
  console.log(JSON.stringify({ ...report, initialHeight }));
  await replacement.evaluate("document.querySelector('#scan').click()");
  const scanDeadline = Date.now() + 10000;
  while (await replacement.evaluate("getComputedStyle(document.querySelector('#results')).display === 'none'")) {
    assert.ok(Date.now() < scanDeadline, 'Scan should display its breakdown');
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.equal(await replacement.evaluate("getComputedStyle(document.querySelector('#vacuum-outcome')).display"), 'none', 'Scan replaces Vacuum feedback with its report');

} finally {
  await context.close();
}
