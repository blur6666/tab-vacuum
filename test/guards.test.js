/**
 * Structural guarantees, not behaviour.
 *
 * These used to enforce a dry run — "nothing anywhere may close a tab". The
 * extension closes tabs now, so the guarantee moved: exactly one file may
 * call the browser's close API, and the manifest may not grow.
 *
 * Do not weaken them to make a change pass. The real protection lives in
 * execute.js, which re-checks every tab against the live browser before
 * closing it; these tests keep that choke point from being routed around.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const SRC = join(ROOT, 'src');

/** The single file permitted to close a tab. */
const CLOSER = join('src', 'lib', 'chrome-tabs.js');

function sourceFiles() {
  return readdirSync(SRC, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath ?? entry.path, entry.name));
}

test('only chrome-tabs.js may close a tab', () => {
  // These patterns cover the ways chrome.tabs.remove is actually reachable.
  // A regex guard cannot be airtight and this one does not pretend to be — it
  // exists to catch a second close path being added by habit, not to defeat
  // someone determined to hide one.
  //
  // An earlier version banned `.remove(` outright. That forbade harmless DOM
  // calls (element.remove(), classList.remove()) across the whole UI while
  // still missing chrome.tabs['remove'](), so it cost real readability and
  // bought no extra safety. Narrowed deliberately; see CLAUDE.md.
  const banned = [
    /tabs\s*\.\s*remove/, //                          chrome.tabs.remove(...) and aliases
    /tabs\s*\[/, //                                    chrome.tabs['remove'](...)
    /\[\s*['"`]tabs['"`]\s*\]\s*\.\s*remove/, //       chrome['tabs'].remove(...)
    /\{[^}]*\bremove\b[^}]*\}\s*=\s*[^;\n]*tabs/, //   const { remove } = chrome.tabs
  ];

  const offenders = [];
  for (const file of sourceFiles()) {
    const name = relative(ROOT, file);
    if (name === CLOSER) continue;

    const contents = readFileSync(file, 'utf8');
    for (const pattern of banned) {
      if (pattern.test(contents)) offenders.push(`${name} matches ${pattern}`);
    }
  }

  assert.deepEqual(offenders, [], `close path outside ${CLOSER}:\n${offenders.join('\n')}`);
});

/**
 * Comments discuss these APIs constantly — config.js documents what
 * chrome.tabs.create() reported on Brave, scan.js explains which constant it
 * inlined. Matching raw text would flag all of it, which is how the old
 * `.remove(` ban went wrong. Strip comments, then match.
 */
function code(contents) {
  return contents
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n');
}

test('chrome-tabs.js is the only file that calls the tabs APIs', () => {
  const offenders = sourceFiles()
    .map((file) => relative(ROOT, file))
    .filter((name) => name !== CLOSER && name.endsWith('.js'))
    .filter((name) =>
      /\bchrome\s*\.\s*(tabs|tabGroups)\b/.test(code(readFileSync(join(ROOT, name), 'utf8'))),
    );

  assert.deepEqual(
    offenders,
    [],
    'scan.js and url.js stay importable by node --test only because of this',
  );
});

test('the manifest asks for tabs, and tabGroups only optionally', () => {
  const manifest = JSON.parse(readFileSync(join(ROOT, 'manifest.json'), 'utf8'));

  // `tabs` is required, on purpose — it is the minimum that lets the scan read
  // urls, and making it optional moved the same warning to a mid-session dialog
  // without removing it.
  //
  // `tabGroups` is optional because it is cosmetic: it names a group "Work"
  // instead of "group 1". Per-group deduplication reads tab.groupId, which
  // needs no permission, so declining costs nothing but labels.
  //
  // What still matters is that nothing ELSE creeps in: host permissions and
  // content scripts are what turn a tab lister into a page reader.
  assert.deepEqual(manifest.permissions, ['tabs']);
  assert.deepEqual(manifest.optional_permissions, ['tabGroups']);
  assert.equal(manifest.host_permissions, undefined);
  assert.equal(manifest.content_scripts, undefined);
  assert.equal(manifest.minimum_chrome_version, '127');
  assert.equal(manifest.manifest_version, 3);
});

test('no dry-run flag survives — a half-removed one would be worse than none', () => {
  const config = readFileSync(join(SRC, 'lib', 'config.js'), 'utf8');
  assert.doesNotMatch(config, /DRY_RUN/);
});
