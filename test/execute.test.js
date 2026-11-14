/**
 * The close path. These tests are what the dry-run guard used to be: proof
 * that nothing closes except what the scan offered and the browser still
 * agrees with, checked at the moment of closing.
 *
 * `closer` and `snapshot` are injected, so no browser and no mock global.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { planCleanup } from '../src/lib/scan.js';
import {
  closeTabs,
  selectClosable,
  bulkSelection,
  closableTabs,
  windowClosersIn,
} from '../src/lib/execute.js';

let nextId = 1;

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

/** Records what it was asked to close so a test can assert on it. */
function spyCloser() {
  const calls = [];
  const closer = (ids) => {
    calls.push([...ids]);
    return Promise.resolve();
  };
  closer.calls = calls;
  return closer;
}

/** A snapshot that returns the tabs exactly as the scan saw them. */
const unchanged = (tabs) => () => Promise.resolve(tabs);

test('tabs shown only for context can never be closed by any path', async () => {
  // The review page lists every tab when the filter is off. Those extra rows
  // are report, not offer — nothing about showing them may make them reachable.
  const junk = tab({ url: 'chrome://newtab/', index: 0 });
  const lone = tab({ url: 'https://example.com/unique', index: 1 });
  const notes = tab({ url: 'file:///home/user/notes.txt', index: 2 });
  const tabs = [junk, lone, notes];

  const plan = planCleanup(tabs);
  assert.deepEqual(plan.otherTabs.map((t) => t.id), [lone.id, notes.id]);

  const offered = closableTabs(plan);
  assert.equal(offered.has(lone.id), false);
  assert.equal(offered.has(notes.id), false);
  assert.deepEqual(bulkSelection(plan), [junk.id]);

  // Even asked for by id directly — a stale or hand-crafted selection.
  const closer = spyCloser();
  const result = await closeTabs(plan, [lone.id, notes.id], {
    closer,
    snapshot: unchanged(tabs),
  });

  assert.equal(result.closed, 0);
  assert.deepEqual(closer.calls, []);
  assert.deepEqual(
    result.skipped.map((s) => s.reason),
    ['not in the scan', 'not in the scan'],
  );
});

test('a system tab is closable on its own but is not part of Kill Em All', async () => {
  const settings = tab({ url: 'chrome://settings/' });
  const plan = planCleanup([settings, tab({ url: 'https://filler.example/' })]);

  assert.ok(closableTabs(plan).has(settings.id), 'can be ticked and closed by hand');
  assert.deepEqual(bulkSelection(plan), [], "Kill Em All doesn't reach for system tabs");

  const closer = spyCloser();
  const result = await closeTabs(plan, [settings.id], {
    closer,
    snapshot: unchanged([settings, tab({ url: 'https://filler.example/' })]),
  });

  assert.equal(result.closed, 1);
  assert.deepEqual(closer.calls, [[settings.id]]);
});

test('a protected system tab is refused and repeats its reason', () => {
  const pinnedSettings = tab({ url: 'chrome://settings/', pinned: true });
  const plan = planCleanup([pinnedSettings, tab({ url: 'https://filler.example/' })]);

  const { close, refused } = selectClosable(plan, [pinnedSettings.id]);

  assert.deepEqual(close, []);
  assert.deepEqual(refused, [{ id: pinnedSettings.id, reason: 'pinned' }]);
});

test('selectClosable keeps ids the scan offered and refuses the rest', () => {
  const junk = tab({ url: 'chrome://newtab/' });
  const plan = planCleanup([junk, tab({ url: 'https://filler.example/' })]);

  const { close, refused } = selectClosable(plan, [junk.id, 4242]);

  assert.deepEqual(close, [junk.id]);
  assert.deepEqual(refused, [{ id: 4242, reason: 'not in the scan' }]);
});

test('selectClosable refuses a protected tab and repeats its reason', () => {
  const pinnedJunk = tab({ url: 'chrome://newtab/', pinned: true });
  const plan = planCleanup([pinnedJunk, tab({ url: 'https://filler.example/' })]);

  const { close, refused } = selectClosable(plan, [pinnedJunk.id]);

  assert.deepEqual(close, []);
  assert.deepEqual(refused, [{ id: pinnedJunk.id, reason: 'pinned' }]);
});

test('selectClosable ignores duplicate ids in the selection', () => {
  const junk = tab({ url: 'chrome://newtab/' });
  const plan = planCleanup([junk, tab({ url: 'https://filler.example/' })]);

  assert.deepEqual(selectClosable(plan, [junk.id, junk.id, junk.id]).close, [junk.id]);
});

test('a keeper is closable by hand but never part of the bulk selection', () => {
  const first = tab({ url: 'https://example.com/a', index: 0 });
  const second = tab({ url: 'https://example.com/a', index: 1 });
  const plan = planCleanup([first, second]);

  const keeper = plan.duplicateGroups[0].tabs.find((t) => t.isKeeper);
  const other = plan.duplicateGroups[0].tabs.find((t) => !t.isKeeper);

  assert.ok(closableTabs(plan).has(keeper.id), 'the ★ can still be ticked by hand');
  assert.deepEqual(bulkSelection(plan), [other.id], 'Kill Em All leaves one copy');
});

test('bulk selection takes unused new tabs and skips protected duplicates', () => {
  const junk = tab({ url: 'chrome://newtab/' });
  const keeper = tab({ url: 'https://example.com/b', index: 0 });
  const audible = tab({ url: 'https://example.com/b', index: 1, audible: true });
  const plain = tab({ url: 'https://example.com/b', index: 2 });

  const plan = planCleanup([junk, keeper, audible, plain]);
  const selection = bulkSelection(plan);

  assert.ok(selection.includes(junk.id), 'unused new tabs are in');
  assert.ok(selection.includes(plain.id), 'an unprotected duplicate is in');
  assert.ok(!selection.includes(audible.id), 'an audible duplicate is not');
  assert.ok(!selection.includes(keeper.id), 'the keeper is not');
});

test('a tab that navigated since the scan is skipped, not closed', async () => {
  const junk = tab({ url: 'chrome://newtab/' });
  const filler = tab({ url: 'https://filler.example/' });
  const plan = planCleanup([junk, filler]);

  // The user opened something in that tab while the review page sat open.
  const now = [{ ...junk, url: 'https://important.example/draft' }, filler];
  const closer = spyCloser();

  const result = await closeTabs(plan, [junk.id], { closer, snapshot: unchanged(now) });

  assert.equal(result.closed, 0);
  assert.deepEqual(result.skipped, [{ id: junk.id, reason: 'navigated since the scan' }]);
  assert.deepEqual(closer.calls, [], 'the browser was never asked to close anything');
});

test('a tab that became pinned or audible since the scan is skipped', async () => {
  for (const [field, expected] of [
    ['pinned', 'now pinned'],
    ['audible', 'now audible'],
  ]) {
    const junk = tab({ url: 'chrome://newtab/' });
    const filler = tab({ url: 'https://filler.example/' });
    const plan = planCleanup([junk, filler]);

    const now = [{ ...junk, [field]: true }, filler];
    const closer = spyCloser();

    const result = await closeTabs(plan, [junk.id], { closer, snapshot: unchanged(now) });

    assert.equal(result.closed, 0, `${field} must block the close`);
    assert.deepEqual(result.skipped, [{ id: junk.id, reason: expected }]);
    assert.deepEqual(closer.calls, []);
  }
});

test('a new tab that became the sole tab in its window since the scan is skipped', async () => {
  const junk = tab({ url: 'chrome://newtab/', windowId: 1 });
  const filler = tab({ url: 'https://filler.example/', windowId: 1 });
  const plan = planCleanup([junk, filler]);

  // filler was closed by user after scan, leaving junk as sole tab in window 1
  const closer = spyCloser();
  const result = await closeTabs(plan, [junk.id], { closer, snapshot: unchanged([junk]) });

  assert.equal(result.closed, 0);
  assert.deepEqual(result.skipped, [{ id: junk.id, reason: 'now only tab in window' }]);
  assert.deepEqual(closer.calls, []);
});

test('a batch of new tabs cannot empty its window', async () => {
  const tabs = [0, 1, 2].map((index) =>
    tab({ url: 'chrome://newtab/', windowId: 1, index }),
  );
  const plan = planCleanup(tabs);
  const closer = spyCloser();

  const result = await closeTabs(plan, bulkSelection(plan), {
    closer,
    snapshot: unchanged(tabs),
  });

  assert.equal(result.closed, 2);
  assert.deepEqual(result.closedIds, [tabs[0].id, tabs[1].id]);
  assert.deepEqual(result.skipped, [
    { id: tabs[2].id, reason: 'would be only tab in window' },
  ]);
  assert.deepEqual(closer.calls, [[tabs[0].id, tabs[1].id]]);
});

test('a new tab added to a group since the scan is skipped', async () => {
  const junk = tab({ url: 'chrome://newtab/', groupId: -1 });
  const filler = tab({ url: 'https://filler.example/' });
  const plan = planCleanup([junk, filler]);

  const now = [{ ...junk, groupId: 42 }, filler];
  const closer = spyCloser();
  const result = await closeTabs(plan, [junk.id], { closer, snapshot: unchanged(now) });

  assert.equal(result.closed, 0);
  assert.deepEqual(result.skipped, [{ id: junk.id, reason: 'now grouped' }]);
  assert.deepEqual(closer.calls, []);
});

test('a tab that started navigating to real content since the scan is skipped', async () => {
  const junk = tab({ url: 'chrome://newtab/' });
  const filler = tab({ url: 'https://filler.example/' });
  const plan = planCleanup([junk, filler]);

  const now = [{ ...junk, pendingUrl: 'https://real-site.com/article' }, filler];
  const closer = spyCloser();
  const result = await closeTabs(plan, [junk.id], { closer, snapshot: unchanged(now) });

  assert.equal(result.closed, 0);
  assert.deepEqual(result.skipped, [{ id: junk.id, reason: 'navigating since the scan' }]);
  assert.deepEqual(closer.calls, []);
});

test('a tab the user already closed is skipped without an error', async () => {
  const junk = tab({ url: 'chrome://newtab/' });
  const filler = tab({ url: 'https://filler.example/' });
  const plan = planCleanup([junk, filler]);

  const closer = spyCloser();
  const result = await closeTabs(plan, [junk.id], { closer, snapshot: unchanged([filler]) });

  assert.equal(result.closed, 0);
  assert.deepEqual(result.skipped, [{ id: junk.id, reason: 'already gone' }]);
});

test('the review page never closes itself', async () => {
  const junk = tab({ url: 'chrome://newtab/' });
  const filler = tab({ url: 'https://filler.example/' });
  const plan = planCleanup([junk, filler]);

  const closer = spyCloser();
  const result = await closeTabs(plan, [junk.id], {
    closer,
    snapshot: unchanged([junk, filler]),
    selfTabId: junk.id,
  });

  assert.equal(result.closed, 0);
  assert.deepEqual(result.skipped, [{ id: junk.id, reason: 'this page' }]);
});

test('the survivors, and only the survivors, reach the browser', async () => {
  const stays = tab({ url: 'chrome://newtab/', index: 0 });
  const goes = tab({ url: 'chrome://newtab/', index: 1 });
  const filler = tab({ url: 'https://filler.example/', index: 2 });
  const plan = planCleanup([stays, goes, filler]);

  const now = [{ ...stays, pinned: true }, goes, filler];
  const closer = spyCloser();

  const result = await closeTabs(plan, [stays.id, goes.id], {
    closer,
    snapshot: unchanged(now),
  });

  assert.equal(result.closed, 1);
  assert.deepEqual(result.closedIds, [goes.id]);
  assert.deepEqual(closer.calls, [[goes.id]], 'one call, one id');
  assert.deepEqual(result.skipped, [{ id: stays.id, reason: 'now pinned' }]);
});

test('an empty selection never touches the browser', async () => {
  const plan = planCleanup([tab({ url: 'https://filler.example/' })]);
  const closer = spyCloser();

  const result = await closeTabs(plan, [], { closer, snapshot: unchanged([]) });

  assert.deepEqual(result, { closed: 0, closedIds: [], skipped: [] });
  assert.deepEqual(closer.calls, []);
});

test('windowClosersIn counts the selected duplicates that are alone in a window', () => {
  // Window 1 keeps two tabs, so closing the copy there costs nothing extra.
  // Window 2 holds a single copy — closing it closes the window.
  const keeper = tab({ url: 'https://example.com/a', windowId: 1, index: 0, active: true });
  const copyBeside = tab({ url: 'https://example.com/a', windowId: 1, index: 1 });
  const copyAlone = tab({ url: 'https://example.com/a', windowId: 2, index: 0 });

  const plan = planCleanup([keeper, copyBeside, copyAlone]);
  const ids = bulkSelection(plan);

  assert.deepEqual([...ids].sort((a, b) => a - b), [copyBeside.id, copyAlone.id].sort((a, b) => a - b));
  assert.equal(windowClosersIn(plan, ids), 1, 'only the lone copy takes a window');
  assert.equal(windowClosersIn(plan, [copyBeside.id]), 0);
  assert.equal(windowClosersIn(plan, []), 0);
});

test('windowClosersIn ignores ids that are not duplicates', () => {
  // A lone new tab or system page never reaches a bulk selection —
  // PROTECT.soleTabInWindow holds it back — so nothing else can be counted.
  const junk = tab({ url: 'chrome://newtab/', windowId: 1, index: 0 });
  const filler = tab({ url: 'https://filler.example/', windowId: 1, index: 1 });
  const plan = planCleanup([junk, filler]);

  assert.equal(windowClosersIn(plan, bulkSelection(plan)), 0);
  assert.equal(windowClosersIn(plan, [9999]), 0, 'an unknown id counts as nothing');
});

test('a lone duplicate is usually the keeper already, so nothing is selected to close a window', () => {
  // Structural, and worth stating: a tab alone in its window is necessarily the
  // active tab of that window, and `active` outranks `most recently used` on
  // the keeper ladder. So the common window-closing duplicate becomes the ★ and
  // Kill 'Em All leaves it alone without needing any warning at all.
  const beside = tab({ url: 'https://example.com/w', windowId: 1, index: 1 });
  const filler = tab({ url: 'https://filler.example/', windowId: 1, index: 2 });
  const alone = tab({ url: 'https://example.com/w', windowId: 2, index: 0, active: true });

  const plan = planCleanup([beside, filler, alone]);
  const group = plan.duplicateGroups[0];

  assert.equal(group.tabs.find((t) => t.isKeeper).id, alone.id, 'the lone copy is the ★');
  assert.equal(windowClosersIn(plan, bulkSelection(plan)), 0, 'so nothing selected closes a window');
});

test('a window-closing duplicate that is not the keeper is counted', () => {
  // Reachable when another copy outranks it: pinned beats active.
  const pinnedKeeper = tab({ url: 'https://example.com/x', windowId: 1, index: 0, pinned: true });
  const filler = tab({ url: 'https://filler.example/', windowId: 1, index: 1 });
  const alone = tab({ url: 'https://example.com/x', windowId: 2, index: 0, active: true });

  const plan = planCleanup([pinnedKeeper, filler, alone]);
  const group = plan.duplicateGroups[0];

  assert.equal(group.tabs.find((t) => t.isKeeper).id, pinnedKeeper.id);
  assert.ok(group.tabs.find((t) => t.id === alone.id).closesWindow);
  assert.deepEqual(bulkSelection(plan), [alone.id]);
  assert.equal(windowClosersIn(plan, bulkSelection(plan)), 1);
});
