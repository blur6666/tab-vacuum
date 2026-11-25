/**
 * The popup's Vacuum action must leave its anchor tab alive so Chromium does
 * not dismiss the popup before it can show the close outcome.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

class Element {
  constructor(id = '') {
    this.id = id;
    this.textContent = '';
    this.title = '';
    this.disabled = false;
    this.attributes = new Map();
    this.children = [];
    this.listeners = new Map();
    this.classNames = new Set();
    this.classList = {
      toggle: (name, force) => {
        const shouldHave = force ?? !this.classNames.has(name);
        if (shouldHave) this.classNames.add(name);
        else this.classNames.delete(name);
        return shouldHave;
      },
      contains: (name) => this.classNames.has(name),
    };
    this.parentElement = { matches: () => false };
  }

  addEventListener(type, handler) {
    this.listeners.set(type, handler);
  }

  setAttribute(name, value) {
    this.attributes.set(name, value);
  }

  removeAttribute(name) {
    this.attributes.delete(name);
  }

  replaceChildren(...children) {
    this.children = children;
  }
}

test('Vacuum keeps its active anchor tab open and renders the close outcome', async (t) => {
  const previousDocument = globalThis.document;
  const previousChrome = globalThis.chrome;
  t.after(() => {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
    if (previousChrome === undefined) delete globalThis.chrome;
    else globalThis.chrome = previousChrome;
  });

  const elements = new Map();
  for (const id of [
    'scan', 'vacuum', 'vacuum-outcome', 'vacuum-outcome-list', 'status', 'results',
    'toggle-protected', 'protected-list', 'open-review', 'copy', 'help-btn', 'help-popover',
    'totals', 'new-tab-count', 'new-tab-windows', 'system-tab-count', 'system-tab-summary',
    'duplicate-count', 'duplicate-summary', 'auto-vacuum',
  ]) {
    elements.set(id, new Element(id));
  }
  globalThis.document = {
    getElementById: (id) => elements.get(id),
    createElement: (tag) => new Element(tag),
  };

  const activeTab = {
    id: 11, windowId: 1, index: 0, url: 'chrome://newtab/', title: 'Active New Tab',
    active: true, pinned: false, audible: false, groupId: -1, windowType: 'normal',
    incognito: false, lastAccessed: 2_000,
  };
  const otherCandidate = {
    ...activeTab, id: 12, index: 1, title: 'Other New Tab', active: false, lastAccessed: 1_000,
  };
  let tabs = [activeTab, otherCandidate];
  const removedIds = [];
  const tabQueries = [];
  globalThis.chrome = {
    permissions: { contains: async () => true },
    storage: { local: { get: async (d) => d, set: async () => {} } },
    tabs: {
      query: async (query) => {
        tabQueries.push(query);
        if (query.active && query.lastFocusedWindow) return tabs.filter((tab) => tab.active);
        return tabs.filter((tab) => query.windowType !== 'normal' || tab.windowType === 'normal');
      },
      remove: async (ids) => {
        removedIds.push(...ids);
        tabs = tabs.filter((tab) => !ids.includes(tab.id));
      },
    },
  };

  await import(`../src/popup/popup.js?popup-test=${Date.now()}`);
  await new Promise(setImmediate);
  await elements.get('vacuum').listeners.get('click')();

  assert.ok(tabQueries.some((query) => query.active && query.lastFocusedWindow));
  assert.deepEqual(removedIds, [otherCandidate.id]);
  assert.ok(tabs.some((tab) => tab.id === activeTab.id), 'the popup anchor tab survives');
  assert.equal(elements.get('vacuum-outcome').classList.contains('hidden'), false);
  assert.deepEqual(
    elements.get('vacuum-outcome-list').children.map((row) => row.textContent),
    [
      'Closed: Other New Tab — unused new tab',
      'Skipped: Active New Tab — unused new tab — this page',
    ],
  );
  assert.match(elements.get('status').textContent, /closed 1 tab; skipped 1/);
});
