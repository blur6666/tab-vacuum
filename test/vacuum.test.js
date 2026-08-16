import test from 'node:test';
import assert from 'node:assert/strict';
import { planVacuum } from '../src/lib/vacuum.js';
import { closeTabs, bulkSelection } from '../src/lib/execute.js';
import { MissingTabsPermissionError } from '../src/lib/scan.js';

let nextId = 100;
function tab(overrides = {}) {
  const id = overrides.id ?? nextId++;
  return {
    id,
    windowId: 1,
    index: id,
    url: 'https://example.com/page',
    title: 'Example Page',
    pinned: false,
    active: false,
    audible: false,
    groupId: -1,
    windowType: 'normal',
    incognito: false,
    ...overrides,
  };
}

function filler(windowId = 1) {
  return tab({ windowId, url: `https://filler.example.com/${nextId++}` });
}

test('planVacuum identifies broader junk (new tab, error, auth) and duplicates', () => {
  const newTab = tab({ url: 'about:blank', title: 'New Tab' });
  const errorTab = tab({ url: 'https://example.com/missing', title: '404 Not Found' });
  const authTab = tab({ url: 'https://example.com/login', title: 'Sign In' });
  const dupe1 = tab({ url: 'https://example.com/article', title: 'Article', active: true });
  const dupe2 = tab({ url: 'https://example.com/article', title: 'Article' });
  const loneTab = tab({ url: 'https://example.com/unique', title: 'Unique' });

  const result = planVacuum([newTab, errorTab, authTab, dupe1, dupe2, loneTab]);

  assert.equal(result.junkTabs.length, 3);
  assert.deepEqual(
    result.junkTabs.map((t) => t.id).sort((a, b) => a - b),
    [newTab.id, errorTab.id, authTab.id].sort((a, b) => a - b),
  );

  assert.equal(result.duplicateGroups.length, 1);
  assert.equal(result.duplicateGroups[0].tabs.length, 2);

  // dupe1 was active, so dupe1 is keeper and dupe2 is closable
  const closableDupe = result.duplicateGroups[0].tabs.find((t) => !t.isKeeper);
  assert.equal(closableDupe.id, dupe2.id);

  assert.equal(result.totalClosable, 4); // 3 junk tabs + 1 duplicate non-keeper
  assert.deepEqual(
    result.closableIds.sort((a, b) => a - b),
    [newTab.id, errorTab.id, authTab.id, dupe2.id].sort((a, b) => a - b),
  );
});

test('planVacuum respects protections (pinned, audible, sole tab in window, extension page)', () => {
  const pinnedJunk = tab({ url: 'about:blank', pinned: true });
  const audibleError = tab({ url: 'https://site.com/err', title: '500 Server Error', audible: true });
  const soleTab = tab({ windowId: 99, url: 'https://site.com/login', title: 'Login' });
  const extensionTab = tab({ id: 999, url: 'chrome://settings/', title: 'Settings' });
  const normalJunk = tab({ url: 'about:blank' });

  const result = planVacuum(
    [pinnedJunk, audibleError, soleTab, extensionTab, normalJunk, filler()],
    { selfTabId: 999 },
  );

  const protectedIds = result.protectedJunkTabs.map((t) => t.id);
  assert.ok(protectedIds.includes(pinnedJunk.id));
  assert.ok(protectedIds.includes(audibleError.id));
  assert.ok(protectedIds.includes(soleTab.id));
  assert.ok(protectedIds.includes(extensionTab.id));

  assert.equal(result.junkTabs.length, 1);
  assert.equal(result.junkTabs[0].id, normalJunk.id);
});

test('planVacuum respects privacy blocklist', () => {
  const bankAuth = tab({ url: 'https://secure.bank.com/login', title: 'Bank Login' });
  const publicAuth = tab({ url: 'https://public.com/login', title: 'Public Login' });

  const result = planVacuum([bankAuth, publicAuth, filler()], {
    blocklist: ['*.bank.com'],
  });

  assert.ok(result.protectedJunkTabs.some((t) => t.id === bankAuth.id));
  assert.ok(result.junkTabs.some((t) => t.id === publicAuth.id));
});

test('planVacuum treats an ordinary system tab as junk, and bulkSelection sweeps it — unlike Kill Em All on planCleanup', () => {
  // Vacuum 'em all! is now the same button on the popup and the review page,
  // with the same maximal reach: unlike planCleanup's plan.systemTabs (which
  // bulkSelection deliberately skips), planVacuum reports a system tab like
  // Settings via plan.junkTabs, which bulkSelection does walk.
  const settings = tab({ url: 'chrome://settings/', title: 'Settings' });
  const other = filler();

  const result = planVacuum([settings, other]);

  assert.equal(result.junkTabs.some((t) => t.id === settings.id), true);
  assert.equal(result.junkTabs.find((t) => t.id === settings.id).junkType, 'internal');
  assert.ok(result.closableIds.includes(settings.id));
  assert.ok(bulkSelection(result.plan).includes(settings.id));
});

test('planVacuum throws MissingTabsPermissionError when tab urls are undefined', () => {
  assert.throws(() => {
    planVacuum([{ id: 1, windowId: 1, title: 'No url permission' }]);
  }, MissingTabsPermissionError);
});

test('closeTabs closes tabs identified by planVacuum cleanly', async () => {
  const junk = tab({ url: 'about:blank' });
  const dupe1 = tab({ url: 'https://example.com/item', active: true });
  const dupe2 = tab({ url: 'https://example.com/item' });
  const keepMe = tab({ url: 'https://example.com/keep' });

  const allTabs = [junk, dupe1, dupe2, keepMe];
  const vacuumResult = planVacuum(allTabs);

  let closedIds = [];
  const fakeCloser = async (ids) => {
    closedIds = ids;
  };
  const fakeSnapshot = async () => allTabs;

  const outcome = await closeTabs(vacuumResult.plan, vacuumResult.closableIds, {
    closer: fakeCloser,
    snapshot: fakeSnapshot,
  });

  assert.equal(outcome.closed, 2);
  assert.deepEqual(closedIds.sort((a, b) => a - b), [junk.id, dupe2.id].sort((a, b) => a - b));
});
