import test from 'node:test';
import assert from 'node:assert/strict';

import { planCleanup, MissingTabsPermissionError } from '../src/lib/scan.js';

let nextId = 1;

/** A tab with realistic defaults; override only what the test is about. */
function tab(overrides = {}) {
  return {
    id: nextId++,
    windowId: 1,
    index: 0,
    url: 'https://example.com/',
    title: 'Example',
    pinned: false,
    active: false,
    audible: false,
    groupId: -1,
    incognito: false,
    lastAccessed: 1_000,
    ...overrides,
  };
}

/** New-tab pages need a companion so soleTabInWindow does not fire. */
function newTab(overrides = {}) {
  return tab({ url: 'chrome://newtab/', title: 'New Tab', ...overrides });
}

function filler(windowId = 1) {
  return tab({ windowId, url: 'https://filler.example/', index: 99 });
}

test('a plain unused new tab is a close candidate', () => {
  const junk = newTab();
  const plan = planCleanup([junk, filler()]);

  assert.deepEqual(
    plan.unusedNewTabs.map((t) => t.id),
    [junk.id],
  );
  assert.equal(plan.protectedTabs.length, 0);
});

test('each protection rule keeps a new tab and records its reason', () => {
  const cases = [
    ['pinned', { pinned: true }],
    ['active', { active: true }],
    ['audible', { audible: true }],
    ['grouped', { groupId: 7 }],
  ];

  for (const [reason, overrides] of cases) {
    const junk = newTab(overrides);
    const plan = planCleanup([junk, filler()]);

    assert.equal(plan.unusedNewTabs.length, 0, `${reason} should not be a candidate`);
    assert.deepEqual(plan.protectedTabs.map((t) => t.id), [junk.id]);
    assert.ok(
      plan.protectedTabs[0].reasons.includes(reason),
      `expected reason "${reason}", got ${plan.protectedTabs[0].reasons.join(', ')}`,
    );
  }
});

test('the sole tab in a window is protected — closing it would close the window', () => {
  const lonely = newTab({ windowId: 42 });
  const plan = planCleanup([lonely, filler(1), filler(1)]);

  assert.equal(plan.unusedNewTabs.length, 0);
  assert.deepEqual(plan.protectedTabs[0].reasons, ['only tab in window']);
});

test('multiple protections are all reported', () => {
  const junk = newTab({ pinned: true, active: true, audible: true, groupId: 3 });
  const plan = planCleanup([junk, filler()]);

  assert.deepEqual(plan.protectedTabs[0].reasons, ['pinned', 'active', 'audible', 'grouped']);
});

test('the review page protects itself', () => {
  const self = newTab({ id: 999 });
  const plan = planCleanup([self, filler()], { selfTabId: 999 });

  assert.equal(plan.unusedNewTabs.length, 0);
  assert.ok(plan.protectedTabs[0].reasons.includes('extension page'));
});

test('a tab navigating away from the new tab page is never a candidate', () => {
  const arriving = newTab({ url: 'chrome://newtab/', pendingUrl: 'https://example.com/article' });
  const plan = planCleanup([arriving, filler()]);

  assert.equal(plan.unusedNewTabs.length, 0);
  assert.equal(plan.protectedTabs.length, 0, 'it is not a new tab at all, so not "protected"');
});

test('a tab navigating towards a new tab page still counts', () => {
  const leaving = newTab({ url: '', pendingUrl: 'chrome://new-tab-page/' });
  const plan = planCleanup([leaving, filler()]);

  assert.deepEqual(plan.unusedNewTabs.map((t) => t.id), [leaving.id]);
});

test('incognito tabs are skipped and counted', () => {
  const plan = planCleanup([newTab({ incognito: true }), filler(), filler()]);

  assert.equal(plan.unusedNewTabs.length, 0);
  assert.equal(plan.totals.skippedIncognito, 1);
  assert.equal(plan.totals.considered, 2);
});

test('non-normal windows are excluded', () => {
  const plan = planCleanup([newTab({ windowType: 'popup' }), filler(), filler()]);

  assert.equal(plan.unusedNewTabs.length, 0);
  assert.equal(plan.totals.considered, 2);
});

test('duplicates group across windows and ignore tracking noise', () => {
  const a = tab({ windowId: 1, index: 0, url: 'https://example.com/post' });
  const b = tab({ windowId: 2, index: 3, url: 'https://example.com/post/?utm_source=x' });
  const c = tab({ windowId: 3, index: 1, url: 'https://example.com/post#comments' });
  const unrelated = tab({ url: 'https://example.com/other' });

  const plan = planCleanup([a, b, c, unrelated]);

  assert.equal(plan.duplicateGroups.length, 1, 'the single tab must not form a group');
  assert.equal(plan.duplicateGroups[0].key, 'https://example.com/post');
  assert.equal(plan.duplicateGroups[0].count, 3);
  assert.equal(plan.totals.windows, 3);
});

test('duplicate groups are sorted largest first', () => {
  const plan = planCleanup([
    tab({ url: 'https://a.example/x' }),
    tab({ url: 'https://a.example/x' }),
    tab({ url: 'https://b.example/y' }),
    tab({ url: 'https://b.example/y' }),
    tab({ url: 'https://b.example/y' }),
  ]);

  assert.deepEqual(plan.duplicateGroups.map((g) => g.count), [3, 2]);
});

test('keeper ladder: pinned beats active beats recency', () => {
  const pinned = tab({ url: 'https://example.com/p', pinned: true, lastAccessed: 1 });
  const active = tab({ url: 'https://example.com/p', active: true, lastAccessed: 2 });
  const recent = tab({ url: 'https://example.com/p', lastAccessed: 9_999 });

  const withPinned = planCleanup([pinned, active, recent]);
  assert.equal(withPinned.duplicateGroups[0].tabs[0].id, pinned.id);
  assert.equal(withPinned.duplicateGroups[0].tabs[0].keeperReason, 'pinned');

  const withoutPinned = planCleanup([active, recent]);
  assert.equal(withoutPinned.duplicateGroups[0].tabs[0].id, active.id);
  assert.equal(withoutPinned.duplicateGroups[0].tabs[0].keeperReason, 'active');
});

test('keeper falls back to recency, then to window order when lastAccessed is absent', () => {
  const older = tab({ url: 'https://example.com/q', lastAccessed: 100 });
  const newer = tab({ url: 'https://example.com/q', lastAccessed: 500 });
  const byTime = planCleanup([older, newer]);
  assert.equal(byTime.duplicateGroups[0].tabs[0].id, newer.id);
  assert.equal(byTime.duplicateGroups[0].tabs[0].keeperReason, 'most recently used');

  // Chrome < 121 has no lastAccessed at all.
  const first = tab({ url: 'https://example.com/r', index: 2, lastAccessed: undefined });
  const second = tab({ url: 'https://example.com/r', index: 5, lastAccessed: undefined });
  const byOrder = planCleanup([second, first]);
  assert.equal(byOrder.duplicateGroups[0].tabs[0].id, first.id);
  assert.equal(byOrder.duplicateGroups[0].tabs[0].keeperReason, 'first in window order');
});

test('exactly one keeper per group; every other tab is unmarked', () => {
  const plan = planCleanup([
    tab({ url: 'https://example.com/s' }),
    tab({ url: 'https://example.com/s' }),
    tab({ url: 'https://example.com/s' }),
  ]);

  const group = plan.duplicateGroups[0];
  assert.equal(group.tabs.filter((t) => t.isKeeper).length, 1);
  assert.equal(group.tabs.filter((t) => t.keeperReason !== null).length, 1);
});

test('new-tab pages never appear in duplicate groups', () => {
  const plan = planCleanup([newTab(), newTab(), newTab(), filler()]);

  assert.equal(plan.duplicateGroups.length, 0);
  assert.equal(plan.unusedNewTabs.length, 3);
});

test('an empty browser produces an empty plan', () => {
  const plan = planCleanup([]);

  assert.deepEqual(plan.unusedNewTabs, []);
  assert.deepEqual(plan.protectedTabs, []);
  assert.deepEqual(plan.duplicateGroups, []);
  assert.deepEqual(plan.totals, { windows: 0, tabs: 0, considered: 0, skippedIncognito: 0 });
});

test('an all-junk window keeps its last tab', () => {
  const junk = [0, 1, 2].map((index) => newTab({ index }));
  const plan = planCleanup(junk);

  // Three tabs in the window, so soleTabInWindow does not fire for any of them.
  assert.equal(plan.unusedNewTabs.length, 3);
});

test('redacted URLs throw instead of producing a catastrophic plan', () => {
  const redacted = [
    { id: 1, windowId: 1, index: 0, pinned: false, active: false },
    { id: 2, windowId: 1, index: 1, pinned: false, active: false },
  ];

  assert.throws(() => planCleanup(redacted), MissingTabsPermissionError);
});

test('totals report what was scanned', () => {
  const plan = planCleanup([
    newTab({ windowId: 1, index: 0 }),
    filler(1),
    tab({ windowId: 2, index: 0, url: 'https://example.com/a' }),
    tab({ windowId: 2, index: 1, url: 'https://example.com/b' }),
  ]);

  assert.equal(plan.totals.tabs, 4);
  assert.equal(plan.totals.considered, 4);
  assert.equal(plan.totals.windows, 2);
});
