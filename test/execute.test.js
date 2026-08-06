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
