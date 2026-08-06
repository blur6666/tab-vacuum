import test from 'node:test';
import assert from 'node:assert/strict';

import { relativeTime, prettyUrl, planToMarkdown } from '../src/lib/format.js';
import { planCleanup } from '../src/lib/scan.js';

const NOW = 1_700_000_000_000;
const MINUTE = 60_000;

test('relativeTime describes recency in human units', () => {
  assert.equal(relativeTime(NOW - 1_000, NOW), 'just now');
  assert.equal(relativeTime(NOW - 5 * MINUTE, NOW), '5m ago');
  assert.equal(relativeTime(NOW - 59 * MINUTE, NOW), '59m ago');
  assert.equal(relativeTime(NOW - 3 * 60 * MINUTE, NOW), '3h ago');
  assert.equal(relativeTime(NOW - 4 * 24 * 60 * MINUTE, NOW), '4d ago');
});

test('relativeTime says "unknown" when lastAccessed is unavailable', () => {
  // Chrome < 121 does not expose Tab.lastAccessed.
  assert.equal(relativeTime(null, NOW), 'unknown');
  assert.equal(relativeTime(undefined, NOW), 'unknown');
});

test('prettyUrl strips the scheme and truncates', () => {
  assert.equal(prettyUrl('https://example.com/'), 'example.com');
  assert.equal(prettyUrl('https://example.com/a/b?c=1'), 'example.com/a/b?c=1');
  assert.equal(prettyUrl(''), '(blank)');
  assert.equal(prettyUrl('chrome://newtab/'), 'chrome://newtab/');
  assert.ok(prettyUrl(`https://example.com/${'x'.repeat(200)}`).length <= 72);
});

test('planToMarkdown reports what the scan found', () => {
  const plan = planCleanup([
    { id: 1, windowId: 1, index: 0, url: 'chrome://newtab/', title: 'New Tab', groupId: -1 },
    { id: 2, windowId: 1, index: 1, url: 'https://example.com/p', title: 'P', groupId: -1 },
    { id: 3, windowId: 2, index: 0, url: 'https://example.com/p/', title: 'P', groupId: -1 },
  ]);

  const report = planToMarkdown(plan);

  assert.match(report, /Unused new tabs — 1 offered/);
  assert.match(report, /https:\/\/example\.com\/p ×2/);
  assert.match(report, /★ keep/);
});

test('planToMarkdown lists the tabs nothing can be done to, with their group', () => {
  const plan = planCleanup([
    { id: 1, windowId: 1, index: 0, url: 'https://example.com/only', title: 'Only', groupId: 6 },
    { id: 2, windowId: 1, index: 1, url: 'file:///home/user/notes.txt', title: 'Notes', groupId: -1 },
  ]);

  const report = planToMarkdown(plan);

  assert.match(report, /## Other tabs — 2 not up for deletion/);
  assert.match(report, /tab 1 · tab group 6 · only copy/);
  assert.match(report, /tab 2 · not scanned for duplicates/);
});

test('planToMarkdown reports system tabs separately from other tabs', () => {
  const plan = planCleanup([
    { id: 1, windowId: 1, index: 0, url: 'chrome://settings/', title: 'Settings', groupId: -1 },
    { id: 2, windowId: 1, index: 1, url: 'chrome://downloads/', title: 'Downloads', groupId: -1, pinned: true },
  ]);

  const report = planToMarkdown(plan);

  assert.match(report, /## System tabs — 1 offered/);
  assert.match(report, /tab 1 · `chrome:\/\/settings\/`/);
  assert.match(report, /## Protected system tabs — 1 kept/);
  assert.match(report, /tab 2 · pinned/);
});

test('planToMarkdown names the tab group and flags protected copies', () => {
  const plan = planCleanup([
    { id: 1, windowId: 1, index: 0, url: 'https://example.com/g', title: 'G', groupId: 4 },
    { id: 2, windowId: 1, index: 1, url: 'https://example.com/g', title: 'G', groupId: 4, audible: true },
  ]);

  const report = planToMarkdown(plan);

  assert.match(report, /×2 · tab group 4/);
  assert.match(report, /protected \(audible\)/);
});
