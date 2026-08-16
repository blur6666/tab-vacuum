/**
 * Vacuum cleanup planner.
 * Scans tabs and computes all closable junk and duplicate non-keeper tabs using
 * broader junk detection rules.
 *
 * Pure — does not touch the chrome global.
 */

import { detectJunk, isBlockedByPrivacy } from './junk-rules.js';
import { normalizeUrl } from './url.js';
import {
  PROTECT,
  NEVER_CLOSE,
  DEDUPE_WITHIN_TAB_GROUPS,
  INCLUDE_INCOGNITO,
} from './config.js';
import {
  MissingTabsPermissionError,
  TAB_GROUP_ID_NONE,
  closeBlockers,
  summarize,
  buildGroup,
  tabGroupId,
} from './scan.js';

export function planVacuum(tabs, { selfTabId = null, blocklist = [] } = {}) {
  const all = Array.isArray(tabs) ? tabs : [];

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
    if (tab.windowType !== undefined && tab.windowType !== 'normal') return false;
    return true;
  });

  const tabsPerWindow = new Map();
  for (const tab of considered) {
    tabsPerWindow.set(tab.windowId, (tabsPerWindow.get(tab.windowId) ?? 0) + 1);
  }

  const junkTabs = [];
  const protectedJunkTabs = [];
  const groupsByKey = new Map();
  const otherTabs = [];

  for (const tab of considered) {
    const junkType = detectJunk(tab);
    if (junkType) {
      const reasons = [];
      if (selfTabId !== null && tab.id === selfTabId) reasons.push('extension page');
      if (PROTECT.pinned && tab.pinned) reasons.push('pinned');
      if (PROTECT.audible && tab.audible) reasons.push('audible');
      if (PROTECT.grouped && tabGroupId(tab) !== TAB_GROUP_ID_NONE) reasons.push('grouped');
      if (PROTECT.soleTabInWindow && tabsPerWindow.get(tab.windowId) === 1) {
        reasons.push('only tab in window');
      }
      if (isBlockedByPrivacy(tab.url, blocklist)) {
        reasons.push('privacy blocklist');
      }

      if (reasons.length > 0) {
        protectedJunkTabs.push({ ...summarize(tab), junkType, reasons, closable: false });
      } else {
        junkTabs.push({ ...summarize(tab), junkType, closable: true });
      }
      continue;
    }

    const key = normalizeUrl(tab.url);
    if (key === null) {
      otherTabs.push({ ...summarize(tab), reason: 'not scanned for duplicates', closable: false });
      continue;
    }

    const groupId = tabGroupId(tab);
    const bucket = DEDUPE_WITHIN_TAB_GROUPS ? `${key}\n${groupId}` : key;
    if (!groupsByKey.has(bucket)) groupsByKey.set(bucket, { key, groupId, tabs: [] });
    groupsByKey.get(bucket).tabs.push(tab);
  }

  const buckets = [...groupsByKey.values()];
  for (const { tabs: members } of buckets) {
    if (members.length < 2) {
      otherTabs.push({ ...summarize(members[0]), reason: 'only copy', closable: false });
    }
  }

  const duplicateGroups = buckets
    .filter((bucket) => bucket.tabs.length >= 2)
    .map((bucket) => buildGroup(bucket, tabsPerWindow));

  const closableIds = [];
  for (const tab of junkTabs) {
    if (tab.closable) closableIds.push(tab.id);
  }
  for (const group of duplicateGroups) {
    for (const tab of group.tabs) {
      if (tab.closable && !tab.isKeeper) closableIds.push(tab.id);
    }
  }

  const plan = {
    totals: {
      windows: new Set(considered.map((tab) => tab.windowId)).size,
      tabs: all.length,
      considered: considered.length,
      skippedIncognito,
    },
    unusedNewTabs: [],
    protectedTabs: [],
    systemTabs: [],
    protectedSystemTabs: [],
    junkTabs,
    protectedJunkTabs,
    duplicateGroups,
    otherTabs,
  };

  return {
    totals: plan.totals,
    junkTabs,
    protectedJunkTabs,
    duplicateGroups,
    closableIds,
    totalClosable: closableIds.length,
    plan,
  };
}
