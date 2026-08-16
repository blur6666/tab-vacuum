/**
 * What the Vacuum button may and may not close.
 *
 * The bulk of these are negative tests. Vacuum closes tabs from the popup with
 * one confirm and no per-tab review, so what matters is not that it finds junk
 * — the scan already does that — but that it never reaches anything else. The
 * first test is the one that used to fail.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { planVacuum, vacuumPreview } from '../src/lib/vacuum.js';
import { closeTabs } from '../src/lib/execute.js';
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
    lastAccessed: 1_000,
    ...overrides,
  };
}

/** Filler so nothing under test is accidentally the sole tab in its window. */
function filler(windowId = 1) {
  return tab({ windowId, url: `https://filler.example/${nextId++}` });
}

test('real content is never junk, however its title or path reads', () => {
  // Every one of these was closable under the title- and path-matching rules
  // this replaced: a page *about* a 404 is not a 404, and an order
  // confirmation is the one tab in a checkout worth keeping.
  const decoys = [
    tab({ url: 'https://github.com/o/r/issues/12', title: 'Fix 404 on /docs page' }),
    tab({ url: 'https://news.example/piece', title: 'Server Error rates spike across the web' }),
    tab({ url: 'https://site.example/x', title: 'Page Not Found — a history of the 404' }),
    tab({ url: 'https://site.example/y', title: 'Access Denied (1994 film)' }),
    tab({ url: 'https://shop.example/checkout/complete', title: 'Order #A1234 confirmed' }),
    tab({ url: 'https://mail.example/verify?token=abc', title: 'Verify your email address' }),
    tab({ url: 'https://bank.example/login', title: 'Sign in' }),
    tab({ url: 'https://example.com/oauth/authorize', title: 'Authorize' }),
    tab({ url: 'https://store.example/thank-you', title: 'Thanks for your order' }),
  ];

  const result = planVacuum([...decoys, filler()]);

  assert.deepEqual(result.closableIds, [], 'none of these may be offered');
  assert.equal(result.totalClosable, 0);
});

test("an extension's own pages are never junk, including this extension's", () => {
  // config.js keeps chrome-extension: out of SYSTEM_URL_SCHEMES on purpose:
  // that scheme is every installed extension's pages, not the browser's.
  const review = tab({
    url: 'chrome-extension://abcdef/src/review/review.html',
    title: 'Review tabs',
  });
  const other = tab({ url: 'chrome-extension://zzz/options.html', title: 'Some extension' });

  const result = planVacuum([review, other, filler()]);

  assert.equal(result.closableIds.includes(review.id), false);
  assert.equal(result.closableIds.includes(other.id), false);
});

test('vacuum takes unused new tabs, system tabs and duplicate non-keepers', () => {
  const blank = tab({ url: 'chrome://newtab/' });
  const settings = tab({ url: 'chrome://settings/' });
  const keeper = tab({ url: 'https://example.com/a', index: 0, active: true });
  const copy = tab({ url: 'https://example.com/a', index: 1 });
  const only = tab({ url: 'https://example.com/unique' });

  const result = planVacuum([blank, settings, keeper, copy, only]);

  assert.deepEqual(
    [...result.closableIds].sort((a, b) => a - b),
    [blank.id, settings.id, copy.id].sort((a, b) => a - b),
  );
  assert.equal(result.closableIds.includes(keeper.id), false, 'the ★ survives');
  assert.equal(result.closableIds.includes(only.id), false, 'a sole copy is not a duplicate');
});

test('a tab navigating away from the new tab page is not offered', () => {
  const leaving = tab({ url: 'chrome://newtab/', pendingUrl: 'https://real.example/article' });

  assert.deepEqual(planVacuum([leaving, filler()]).closableIds, []);
});

test('every protection is honoured, because the scan computes them', () => {
  const pinned = tab({ url: 'chrome://newtab/', pinned: true });
  const audible = tab({ url: 'chrome://newtab/', audible: true });
  const grouped = tab({ url: 'chrome://newtab/', groupId: 7 });
  const sole = tab({ url: 'chrome://newtab/', windowId: 99 });
  const self = tab({ id: 4242, url: 'chrome://settings/' });

  const result = planVacuum([pinned, audible, grouped, sole, self, filler()], {
    selfTabId: 4242,
  });

  assert.deepEqual(result.closableIds, [], 'all five are protected');
});

test('a duplicate that is pinned or audible is left alone', () => {
  const keeper = tab({ url: 'https://example.com/b', index: 0 });
  const loud = tab({ url: 'https://example.com/b', index: 1, audible: true });
  const plain = tab({ url: 'https://example.com/b', index: 2 });

  const result = planVacuum([keeper, loud, plain]);

  assert.deepEqual(result.closableIds, [plain.id]);
});

test('incognito tabs and non-normal windows stay out', () => {
  const secret = tab({ url: 'chrome://newtab/', incognito: true });
  const devtools = tab({ url: 'chrome://newtab/', windowType: 'devtools' });

  assert.deepEqual(planVacuum([secret, devtools, filler()]).closableIds, []);
});

test('redacted urls throw rather than proposing to close the whole browser', () => {
  assert.throws(
    () => planVacuum([{ id: 1, windowId: 1, index: 0, title: 'no permission' }]),
    MissingTabsPermissionError,
  );
});

test('an empty browser offers nothing', () => {
  assert.deepEqual(planVacuum([]).closableIds, []);
  assert.equal(planVacuum([]).totalClosable, 0);
});

test('the preview names every tab it will close, and only those', () => {
  const blank = tab({ url: 'chrome://newtab/' });
  const settings = tab({ url: 'chrome://settings/' });
  const keeper = tab({ url: 'https://example.com/c', index: 0, active: true });
  const copy = tab({ url: 'https://example.com/c', index: 1 });

  const result = planVacuum([blank, settings, keeper, copy]);
  const preview = vacuumPreview(result.plan);

  assert.deepEqual(
    preview.map((r) => r.id).sort((a, b) => a - b),
    [...result.closableIds].sort((a, b) => a - b),
    'preview and selection must not disagree',
  );
  assert.deepEqual(
    preview.map((r) => r.why).sort(),
    ['duplicate', 'system tab', 'unused new tab'],
  );
});

test('what planVacuum offers is exactly what closeTabs will accept', async () => {
  const blank = tab({ url: 'chrome://newtab/' });
  const settings = tab({ url: 'chrome://settings/' });
  const keeper = tab({ url: 'https://example.com/d', index: 0, active: true });
  const copy = tab({ url: 'https://example.com/d', index: 1 });
  const all = [blank, settings, keeper, copy];

  const result = planVacuum(all);

  const calls = [];
  const outcome = await closeTabs(result.plan, result.closableIds, {
    closer: (ids) => {
      calls.push([...ids]);
      return Promise.resolve();
    },
    snapshot: () => Promise.resolve(all),
  });

  assert.equal(outcome.closed, result.totalClosable);
  assert.deepEqual(outcome.skipped, [], 'nothing the plan offered may be refused');
  assert.deepEqual(calls.length, 1, 'one call, one batch');
});
