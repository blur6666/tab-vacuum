/**
 * The core decision logic: one pass over the tab list produces both features.
 *
 * Pure — takes plain `Tab`-shaped objects, returns a plain plan object, and
 * never touches the `chrome` global so `node --test` can import it directly.
 */

import { isNewTabUrl, normalizeUrl } from './url.js';
import { PROTECT, INCLUDE_INCOGNITO } from './config.js';

/** chrome.tabGroups.TAB_GROUP_ID_NONE — inlined so this file stays chrome-free. */
const TAB_GROUP_ID_NONE = -1;

export class MissingTabsPermissionError extends Error {
  constructor(
    message = 'Tab URLs are redacted — the "tabs" permission has not been granted.',
  ) {
    super(message);
    this.name = 'MissingTabsPermissionError';
  }
}

/**
 * @param {Array<object>} tabs   chrome.tabs.Tab-shaped objects
 * @param {{selfTabId?: number|null}} options
 */
export function planCleanup(tabs, { selfTabId = null } = {}) {
  const all = Array.isArray(tabs) ? tabs : [];

  // Interlock. Without the `tabs` permission `url` is undefined rather than
  // '', which would make every tab in the browser look like a blank new tab.
  // Refuse to produce a plan at all rather than produce a catastrophic one.
  for (const tab of all) {
    if (tab.url === undefined && tab.pendingUrl === undefined) {
      throw new MissingTabsPermissionError();
    }
  }

  let skippedIncognito = 0;
  const considered = all.filter((tab) => {
    if (tab.incognito && !INCLUDE_INCOGNITO) {
      skippedIncognito += 1;
      return false;
    }
    // chrome-tabs.js already filters to normal windows; belt and braces for
    // callers and tests that pass a raw list.
    if (tab.windowType !== undefined && tab.windowType !== 'normal') return false;
    return true;
  });

  const tabsPerWindow = new Map();
  for (const tab of considered) {
    tabsPerWindow.set(tab.windowId, (tabsPerWindow.get(tab.windowId) ?? 0) + 1);
  }

  const unusedNewTabs = [];
  const protectedTabs = [];
  const groupsByKey = new Map();

  for (const tab of considered) {
    if (isNewTabish(tab)) {
      const reasons = protectionReasons(tab, tabsPerWindow, selfTabId);
      if (reasons.length > 0) {
        protectedTabs.push({ ...summarize(tab), reasons });
      } else {
        unusedNewTabs.push(summarize(tab));
      }
      continue;
    }

    const key = normalizeUrl(tab.url);
    if (key === null) continue;
    if (!groupsByKey.has(key)) groupsByKey.set(key, []);
    groupsByKey.get(key).push(tab);
  }

  const duplicateGroups = [...groupsByKey.entries()]
    .filter(([, group]) => group.length >= 2)
    .map(([key, group]) => buildGroup(key, group))
    .sort((a, b) => b.count - a.count || compare(a.key, b.key));

  return {
    totals: {
      windows: new Set(considered.map((tab) => tab.windowId)).size,
      tabs: all.length,
      considered: considered.length,
      skippedIncognito,
    },
    unusedNewTabs,
    protectedTabs,
    duplicateGroups,
  };
}

/**
 * A tab counts as an unused new tab only if what it shows *and* what it is
 * navigating to are both new-tab pages. A tab mid-navigation away from the
 * new tab page is real content arriving, never a candidate.
 */
function isNewTabish(tab) {
  if (!isNewTabUrl(tab.url ?? '')) return false;
  if (tab.pendingUrl !== undefined && tab.pendingUrl !== '' && !isNewTabUrl(tab.pendingUrl)) {
    return false;
  }
  return true;
}

function protectionReasons(tab, tabsPerWindow, selfTabId) {
  const reasons = [];
  if (selfTabId !== null && tab.id === selfTabId) reasons.push('extension page');
  if (PROTECT.pinned && tab.pinned) reasons.push('pinned');
  if (PROTECT.active && tab.active) reasons.push('active');
  if (PROTECT.audible && tab.audible) reasons.push('audible');
  if (PROTECT.grouped && tab.groupId !== undefined && tab.groupId !== TAB_GROUP_ID_NONE) {
    reasons.push('grouped');
  }
  if (PROTECT.soleTabInWindow && tabsPerWindow.get(tab.windowId) === 1) {
    reasons.push('only tab in window');
  }
  return reasons;
}

function summarize(tab) {
  return {
    id: tab.id,
    windowId: tab.windowId,
    index: tab.index,
    url: tab.url ?? '',
    title: tab.title ?? '',
    lastAccessed: typeof tab.lastAccessed === 'number' ? tab.lastAccessed : null,
  };
}

function buildGroup(key, group) {
  const keeper = pickKeeper(group);
  const tabs = [...group]
    .sort(
      (a, b) =>
        Number(b.id === keeper.tab.id) - Number(a.id === keeper.tab.id) ||
        a.windowId - b.windowId ||
        a.index - b.index,
    )
    .map((tab) => ({
      ...summarize(tab),
      isKeeper: tab.id === keeper.tab.id,
      keeperReason: tab.id === keeper.tab.id ? keeper.reason : null,
    }));

  return { key, count: group.length, tabs };
}

/** pinned > active > most recently used > earliest in window order. */
function pickKeeper(group) {
  const pinned = group.filter((tab) => tab.pinned);
  if (pinned.length > 0) return { tab: earliest(pinned), reason: 'pinned' };

  const active = group.filter((tab) => tab.active);
  if (active.length > 0) return { tab: earliest(active), reason: 'active' };

  const timed = group.filter((tab) => typeof tab.lastAccessed === 'number');
  if (timed.length > 0) {
    const newest = timed.reduce((a, b) => (b.lastAccessed > a.lastAccessed ? b : a));
    const tied = timed.filter((tab) => tab.lastAccessed === newest.lastAccessed);
    return { tab: earliest(tied), reason: 'most recently used' };
  }

  return { tab: earliest(group), reason: 'first in window order' };
}

/** Deterministic tie-break: lowest index, then lowest window id, then lowest tab id. */
function earliest(group) {
  return [...group].sort(
    (a, b) => a.index - b.index || a.windowId - b.windowId || a.id - b.id,
  )[0];
}

function compare(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}
