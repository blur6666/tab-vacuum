import test from 'node:test';
import assert from 'node:assert/strict';
import { runVacuum } from '../src/lib/vacuum-run.js';
import { closeTabs } from '../src/lib/execute.js';

const tabs = [
  { id: 1, windowId: 10, index: 0, url: 'https://example.com/', title: 'Keep me', groupId: -1 },
  { id: 2, windowId: 10, index: 1, url: 'chrome://newtab/', title: 'New Tab', groupId: -1, active: true },
];

test('cleanup returns removed-tab details and restores popup when its active tab closes', async () => {
  let removed;
  const result = await runVacuum({
    query: async () => tabs,
    windowId: 10,
    close: (plan, ids) => closeTabs(plan, ids, {
      snapshot: async () => tabs,
      closer: async (ids) => { removed = ids; },
    }),
  });
  assert.deepEqual(removed, [2]);
  assert.deepEqual(result.outcome.closedIds, [2]);
  assert.equal(result.restorePopup, true);
  assert.deepEqual(result.rows, [{ id: 2, title: 'New Tab', url: 'chrome://newtab/', why: 'unused new tab' }]);
});

test('a skipped active tab does not trigger popup restoration', async () => {
  const result = await runVacuum({
    query: async () => tabs,
    windowId: 10,
    close: (plan, ids) => closeTabs(plan, ids, {
      snapshot: async () => tabs.map((tab) => ({ ...tab, pinned: true })),
      closer: async () => assert.fail('protected tabs must survive'),
    }),
  });
  assert.equal(result.restorePopup, false);
  assert.equal(result.outcome.closed, 0);
  assert.equal(result.outcome.skipped[0].id, 2);
});

test('closing an active tab in another window does not reopen the host popup', async () => {
  const result = await runVacuum({
    query: async () => tabs,
    windowId: 99,
    close: async () => ({ closed: 1, closedIds: [2], skipped: [] }),
  });
  assert.equal(result.restorePopup, false);
});
