import { queryAllTabs } from './chrome-tabs.js';
import { planVacuum } from './vacuum.js';
import { closeTabs } from './execute.js';

/** Runs outside the popup: removing its active tab can destroy that document. */
export async function runVacuum({
  query = queryAllTabs,
  close = closeTabs,
  windowId,
} = {}) {
  const tabs = await query();
  const result = planVacuum(tabs);
  const activeTab = tabs.find((tab) => tab.windowId === windowId && tab.active);
  const rows = result.rows;
  const outcome = await close(result.plan, result.closableIds);
  return {
    outcome,
    rows,
    // Only restore a popup dismissed by our own cleanup, never an unrelated one.
    restorePopup: outcome.closedIds.includes(activeTab?.id),
  };
}
