/**
 * Enforces CLAUDE.md rule 1. These tests are the reason the dry-run guarantee
 * is a property of the repository rather than a matter of discipline.
 *
 * Do not weaken them to make a change pass — graduating to live tab closing is
 * a deliberate, reviewed step (see the checklist in README.md).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { DRY_RUN } from '../src/lib/config.js';
import { closeTabs } from '../src/lib/execute.js';

const SRC = join(import.meta.dirname, '..', 'src');

function sourceFiles() {
  return readdirSync(SRC, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath ?? entry.path, entry.name));
}

test('DRY_RUN is on', () => {
  assert.equal(DRY_RUN, true);
});

test('no tab-closing call exists anywhere in src/', () => {
  // These patterns cover the ways chrome.tabs.remove is actually reachable.
  // A regex guard cannot be airtight and this one does not pretend to be — the
  // load-bearing guarantee is execute.js, which has no live close branch at all.
  //
  // An earlier version banned `.remove(` outright. That forbade harmless DOM
  // calls (element.remove(), classList.remove()) across the whole UI while
  // still missing chrome.tabs['remove'](), so it cost real readability and
  // bought no extra safety. Narrowed deliberately; see README.md.
  const banned = [
    /tabs\s*\.\s*remove/, //                          chrome.tabs.remove(...) and aliases
    /tabs\s*\[/, //                                    chrome.tabs['remove'](...)
    /\[\s*['"`]tabs['"`]\s*\]\s*\.\s*remove/, //       chrome['tabs'].remove(...)
    /\{[^}]*\bremove\b[^}]*\}\s*=\s*[^;\n]*tabs/, //   const { remove } = chrome.tabs
  ];

  const offenders = [];
  for (const file of sourceFiles()) {
    const contents = readFileSync(file, 'utf8');
    for (const pattern of banned) {
      if (pattern.test(contents)) offenders.push(`${file} matches ${pattern}`);
    }
  }

  assert.deepEqual(offenders, [], `dry-run violation:\n${offenders.join('\n')}`);
});

test('closeTabs closes nothing and reports what it would have closed', () => {
  const result = closeTabs([1, 2, 3]);

  assert.equal(result.closed, 0);
  assert.deepEqual(result.wouldClose, [1, 2, 3]);
});

test('closeTabs does not mutate the caller\'s array', () => {
  const ids = [1, 2];
  const result = closeTabs(ids);

  result.wouldClose.push(3);
  assert.deepEqual(ids, [1, 2]);
});

test('the manifest requests tabs and nothing else', () => {
  const manifest = JSON.parse(
    readFileSync(join(import.meta.dirname, '..', 'manifest.json'), 'utf8'),
  );

  // `tabs` is required, on purpose — it is the minimum that lets the scan read
  // urls, and making it optional moved the same warning to a mid-session dialog
  // without removing it. What still matters is that nothing ELSE creeps in:
  // host permissions and content scripts are what turn a tab lister into a
  // page reader.
  assert.deepEqual(manifest.permissions, ['tabs']);
  assert.equal(manifest.optional_permissions, undefined);
  assert.equal(manifest.host_permissions, undefined);
  assert.equal(manifest.content_scripts, undefined);
  assert.equal(manifest.manifest_version, 3);
});
