/**
 * What the Vacuum button closes.
 *
 * This is a *selection* over the ordinary scan, not a second scan with its own
 * rules. `planCleanup()` already classifies every tab and computes every
 * protection; re-deriving any of that here would mean two copies of the same
 * ladder drifting apart, and the copy used by the one-click button is the worst
 * one to get wrong.
 *
 * Vacuum takes three things:
 *
 *   - unused new tabs
 *   - system tabs (Settings, Downloads, History, ...)
 *   - every duplicate except the one copy each group keeps
 *
 * which is Kill 'Em All plus system tabs. Only `closable` tabs are ever
 * included, so protections and the keeper rule hold exactly as they do on the
 * review page.
 *
 * Pure — does not touch the `chrome` global.
 */

import { planCleanup } from './scan.js';

/**
 * @param {Array<object>} tabs   chrome.tabs.Tab-shaped objects
 * @param {{selfTabId?: number|null}} options
 * @returns {{totals: object, closableIds: number[], totalClosable: number, plan: object}}
 */
export function planVacuum(tabs, { selfTabId = null } = {}) {
  // Throws MissingTabsPermissionError when urls are redacted, same as any
  // other scan. Never soften that — see CLAUDE.md.
  const plan = planCleanup(tabs, { selfTabId });

  const closableIds = [
    ...plan.unusedNewTabs.filter((tab) => tab.closable).map((tab) => tab.id),
    ...plan.systemTabs.filter((tab) => tab.closable).map((tab) => tab.id),
    ...plan.duplicateGroups.flatMap((group) =>
      group.tabs.filter((tab) => tab.closable && !tab.isKeeper).map((tab) => tab.id),
    ),
  ];

  return {
    totals: plan.totals,
    closableIds,
    totalClosable: closableIds.length,
    // The full plan, so closeTabs() can re-validate every id against it.
    plan,
  };
}

/**
 * A one-line-per-tab summary of what Vacuum is about to close, so the confirm
 * can name the tabs instead of only counting them. Grouped by why.
 *
 * @returns {Array<{id: number, url: string, title: string, why: string}>}
 */
export function vacuumPreview(plan) {
  const rows = [];

  for (const tab of plan.unusedNewTabs) {
    if (tab.closable) rows.push({ ...row(tab), why: 'unused new tab' });
  }
  for (const tab of plan.systemTabs) {
    if (tab.closable) rows.push({ ...row(tab), why: 'system tab' });
  }
  for (const group of plan.duplicateGroups) {
    for (const tab of group.tabs) {
      if (tab.closable && !tab.isKeeper) rows.push({ ...row(tab), why: 'duplicate' });
    }
  }

  return rows;
}

function row(tab) {
  return { id: tab.id, url: tab.url, title: tab.title };
}
