/**
 * The core decision logic: one pass over the tab list produces all three
 * features — unused new tabs, system tabs, and duplicate groups.
 *
 * Pure — takes plain `Tab`-shaped objects, returns a plain plan object, and
 * never touches the `chrome` global so `node --test` can import it directly.
 */

import { isNewTabUrl, isSystemPageUrl, normalizeUrl } from './url.js';
import {
  PROTECT,
  NEVER_CLOSE,
  DEDUPE_WITHIN_TAB_GROUPS,
  INCLUDE_INCOGNITO,
} from './config.js';

/** chrome.tabGroups.TAB_GROUP_ID_NONE — inlined so this file stays chrome-free. */
export const TAB_GROUP_ID_NONE = -1;

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
  const systemTabs = [];
  const protectedSystemTabs = [];
  const otherTabs = [];
  const groupsByKey = new Map();

  for (const tab of considered) {
    if (isNewTabish(tab)) {
      const reasons = protectionReasons(tab, tabsPerWindow, selfTabId);
      if (reasons.length > 0) {
        protectedTabs.push({ ...summarize(tab), reasons, closable: false });
      } else {
        unusedNewTabs.push({ ...summarize(tab), closable: true });
      }
      continue;
    }

    // Settings, Downloads, Extensions, ... — a single-instance offer like an
    // unused new tab, not a candidate for duplicate detection.
    if (isSystemPageUrl(tab.url)) {
      const reasons = protectionReasons(tab, tabsPerWindow, selfTabId);
      if (reasons.length > 0) {
        protectedSystemTabs.push({ ...summarize(tab), reasons, closable: false });
      } else {
        systemTabs.push({ ...summarize(tab), closable: true });
      }
      continue;
    }

    const key = normalizeUrl(tab.url);
    if (key === null) {
      otherTabs.push(bystander(tab, 'not scanned for duplicates'));
      continue;
    }

    // Group membership is part of the identity: the same page open in "Work"
    // and in "Research" is two things a user chose to keep, not a duplicate.
    const groupId = tabGroupId(tab);
    const bucket = DEDUPE_WITHIN_TAB_GROUPS ? `${key}\n${groupId}` : key;

    if (!groupsByKey.has(bucket)) groupsByKey.set(bucket, { key, groupId, tabs: [] });
    groupsByKey.get(bucket).tabs.push(tab);
  }

  const buckets = [...groupsByKey.values()];

  // Everything that survived the scan without being offered for anything. It
  // is reported so the review page can show the whole profile, never so it can
  // be acted on: `closable` is false and execute.js only ever walks
  // unusedNewTabs and duplicateGroups.
  //
  // Destructured to `members` rather than indexed off `bucket`: the close-path
  // guard in test/guards.test.js bans that literal subscript everywhere but
  // chrome-tabs.js, comments included.
  for (const { tabs: members } of buckets) {
    if (members.length < 2) otherTabs.push(bystander(members[0], 'only copy'));
  }
  otherTabs.sort((a, b) => a.windowId - b.windowId || a.index - b.index);

  const duplicateGroups = buckets
    .filter((bucket) => bucket.tabs.length >= 2)
    .map((bucket) => buildGroup(bucket, tabsPerWindow))
    .sort(
      (a, b) => b.count - a.count || compare(a.key, b.key) || a.groupId - b.groupId,
    );

  return {
    totals: {
      windows: new Set(considered.map((tab) => tab.windowId)).size,
      tabs: all.length,
      considered: considered.length,
      skippedIncognito,
    },
    unusedNewTabs,
    protectedTabs,
    systemTabs,
    protectedSystemTabs,
    otherTabs,
    duplicateGroups,
  };
}

/** A tab the scan looked at and had nothing to say about. Never closable. */
function bystander(tab, reason) {
  return { ...summarize(tab), reason, closable: false };
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
  if (PROTECT.grouped && tabGroupId(tab) !== TAB_GROUP_ID_NONE) reasons.push('grouped');
  if (PROTECT.soleTabInWindow && tabsPerWindow.get(tab.windowId) === 1) {
    reasons.push('only tab in window');
  }
  return reasons;
}

/**
 * Why a duplicate cannot be closed, whatever the UI asked for. Deliberately
 * shorter than protectionReasons — see NEVER_CLOSE in config.js for which
 * rules apply to duplicates and why `grouped` is not one of them.
 *
 * Exported because execute.js re-runs it against a fresh tab immediately
 * before closing: the review page can sit open while tabs change underneath it.
 */
export function closeBlockers(tab) {
  const reasons = [];
  if (NEVER_CLOSE.pinned && tab.pinned) reasons.push('pinned');
  if (NEVER_CLOSE.audible && tab.audible) reasons.push('audible');
  if (NEVER_CLOSE.active && tab.active) reasons.push('active');
  if (NEVER_CLOSE.grouped && tabGroupId(tab) !== TAB_GROUP_ID_NONE) reasons.push('grouped');
  return reasons;
}

/** Chrome omits groupId entirely on older builds; absent means ungrouped. */
export function tabGroupId(tab) {
  return tab.groupId ?? TAB_GROUP_ID_NONE;
}

export function summarize(tab) {
  return {
    id: tab.id,
    windowId: tab.windowId,
    index: tab.index,
    // Carried on every reported tab, not just on duplicate buckets: the review
    // page shows a group column per row. -1 means ungrouped.
    groupId: tabGroupId(tab),
    url: tab.url ?? '',
    title: tab.title ?? '',
    lastAccessed: typeof tab.lastAccessed === 'number' ? tab.lastAccessed : null,
  };
}

export function buildGroup({ key, groupId, tabs: group }, tabsPerWindow) {
  const keeper = pickKeeper(group);
  const tabs = [...group]
    .sort(
      (a, b) =>
        Number(b.id === keeper.tab.id) - Number(a.id === keeper.tab.id) ||
        a.windowId - b.windowId ||
        a.index - b.index,
    )
    .map((tab) => {
      const isKeeper = tab.id === keeper.tab.id;
      const protections = closeBlockers(tab);

      return {
        ...summarize(tab),
        isKeeper,
        keeperReason: isKeeper ? keeper.reason : null,
        protections,
        // The keeper is not "protected" — it is simply the copy we suggest you
        // keep, and you are free to tick it and keep a different one instead.
        closable: protections.length === 0,
        // Advisory only: closing this one takes its window with it.
        closesWindow: tabsPerWindow.get(tab.windowId) === 1,
      };
    });

  return { key, groupId, count: group.length, tabs };
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
