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
 * @returns {{closableIds: number[], totalClosable: number, rows: Array<object>, plan: object}}
 */
export function planVacuum(tabs, { selfTabId = null } = {}) {
  // Throws MissingTabsPermissionError when urls are redacted, same as any
  // other scan. Never soften that — see CLAUDE.md.
  const plan = planCleanup(tabs, { selfTabId });

  const rows = vacuumPreview(plan);
  const closableIds = rows.map((tab) => tab.id);

  return {
    closableIds,
    totalClosable: closableIds.length,
    rows,
    // The full plan, so closeTabs() can re-validate every id against it.
    plan,
  };
}

/**
 * A one-line-per-tab summary of what Vacuum may close, grouped by reason.
 * The popup uses it after revalidation to identify tabs actually closed or skipped.
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

/**
 * What the scheduled auto-vacuum closes: the same selection as the button,
 * minus the front tab of every window.
 *
 * The button keeps only the tab beneath the popup, because the person pressing
 * it is looking at that tab. A timer has no such anchor — it fires while you
 * are typing into a fresh new tab or reading Settings — so every window's
 * active tab is the one you might be using right now, and none of them is
 * taken by a click you did not make.
 *
 * Pure — does not touch the `chrome` global.
 *
 * @param {Array<object>} tabs   chrome.tabs.Tab-shaped objects
 * @returns {{closableIds: number[], totalClosable: number, rows: Array<object>, plan: object}}
 */
export function planAutoVacuum(tabs) {
  const vacuum = planVacuum(tabs);
  const activeIds = new Set(tabs.filter((tab) => tab.active).map((tab) => tab.id));
  const rows = vacuum.rows.filter((row) => !activeIds.has(row.id));
  const closableIds = rows.map((row) => row.id);

  return { ...vacuum, rows, closableIds, totalClosable: closableIds.length };
}
