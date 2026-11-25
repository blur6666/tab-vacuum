/**
 * Auto-vacuum is Vacuum without a popup, so what matters is that it does
 * nothing while the user is away and never outruns closeTabs()'s protections.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { runAutoVacuum } from '../src/lib/auto-vacuum.js';

function tab(id, overrides = {}) {
  return {
    id, windowId: 1, index: id, url: 'https://example.com/page', title: 't',
    pinned: false, active: false, audible: false, groupId: -1,
    windowType: 'normal', incognito: false, lastAccessed: 1_000, ...overrides,
  };
}

function deps(tabs, { active = true, activeId = null } = {}) {
  const closed = [];
  let queried = 0;
  return {
    closed,
    queried: () => queried,
    deps: {
      queryTabs: async () => { queried += 1; return tabs; },
      snapshot: async () => tabs,
      isActive: async () => active,
      getActiveTabId: async () => activeId,
      closer: async (ids) => { closed.push(...ids); },
    },
  };
}

const blank = (id, o) => tab(id, { url: 'chrome://newtab/', ...o });
const filler = tab(1, { url: 'https://filler.example/' });

test('does no work at all while the browser is in the background', async () => {
  const d = deps([filler, blank(2), blank(3)], { active: false });
  assert.deepEqual(await runAutoVacuum(d.deps), { ran: false, closed: 0, why: 'browser in background' });
  assert.equal(d.queried(), 0, 'tabs are not even read');
  assert.deepEqual(d.closed, []);
});

test('while active, closes what Vacuum would close', async () => {
  const d = deps([filler, blank(2), blank(3), tab(4), tab(5)]);
  const result = await runAutoVacuum(d.deps);
  assert.deepEqual(d.closed.sort(), [2, 3, 5]);
  assert.equal(result.closed, 3);
});

test('keeps the tab the user is looking at', async () => {
  const d = deps([filler, blank(2, { active: true }), blank(3)], { activeId: 2 });
  await runAutoVacuum(d.deps);
  assert.deepEqual(d.closed, [3]);
});

test('protections still hold: pinned and audible duplicates stay', async () => {
  const d = deps([filler, tab(2), tab(3, { pinned: true }), tab(4, { audible: true })]);
  await runAutoVacuum(d.deps);
  assert.ok(!d.closed.includes(3) && !d.closed.includes(4));
});

test('redacted urls (no tabs permission) do nothing, silently', async () => {
  const d = deps([{ ...filler, url: undefined }, { ...blank(2), url: undefined }]);
  assert.deepEqual(await runAutoVacuum(d.deps), { ran: false, closed: 0, why: 'tabs permission missing' });
  assert.deepEqual(d.closed, []);
});
