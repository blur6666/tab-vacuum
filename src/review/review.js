import { queryAllTabs, getSelfTabId } from '../lib/chrome-tabs.js';
import { hasTabsPermission, requestTabsPermission } from '../lib/permissions.js';
import { planCleanup, MissingTabsPermissionError } from '../lib/scan.js';
import { relativeTime, planToMarkdown } from '../lib/format.js';

const $ = (id) => document.getElementById(id);

const groupsEl = $('groups');
const summary = $('summary');
const status = $('status');
const rescan = $('rescan');
const copyButton = $('copy');

let lastPlan = null;
let windowNumbers = new Map();

rescan.addEventListener('click', () => {
  // `tabs` is required, so this never prompts — it re-checks in case the
  // permission was revoked from the Details page while this tab sat open.
  requestTabsPermission()
    .then((ok) => (ok ? load() : needsPermission()))
    .catch(showError);
});

copyButton.addEventListener('click', async () => {
  if (!lastPlan) return;
  await navigator.clipboard.writeText(planToMarkdown(lastPlan));
  copyButton.textContent = '✓ Copied';
  setTimeout(() => {
    copyButton.textContent = '⧉ Copy report';
  }, 1500);
});

/**
 * No snapshot is passed from the popup — with no storage permission and no
 * service worker, re-running the scan here is both simpler and always fresh.
 */
async function load() {
  status.textContent = 'Scanning…';

  const [tabs, selfTabId] = await Promise.all([queryAllTabs(), getSelfTabId()]);
  const plan = planCleanup(tabs, { selfTabId });
  lastPlan = plan;

  numberWindows(plan);
  render(plan);
}

function render(plan) {
  status.textContent = '';

  const duplicateTabs = plan.duplicateGroups.reduce((sum, group) => sum + group.count, 0);
  summary.textContent = plan.duplicateGroups.length
    ? `${plan.duplicateGroups.length} group${plan.duplicateGroups.length === 1 ? '' : 's'} · ` +
      `${duplicateTabs} tabs across ${plan.totals.windows} window` +
      `${plan.totals.windows === 1 ? '' : 's'}`
    : `Scanned ${plan.totals.considered} tabs across ${plan.totals.windows} windows.`;

  if (plan.duplicateGroups.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'empty';
    empty.textContent = 'No duplicate tabs found.';
    groupsEl.replaceChildren(empty);
    return;
  }

  groupsEl.replaceChildren(...plan.duplicateGroups.map(renderGroup));
}

function renderGroup(group) {
  const section = document.createElement('section');
  section.className = 'group';

  const head = document.createElement('div');
  head.className = 'group-head';

  const key = document.createElement('span');
  key.className = 'group-key';
  key.textContent = group.key;

  const count = document.createElement('span');
  count.className = 'group-count';
  count.textContent = `×${group.count}`;

  head.append(key, count);
  section.append(head);

  for (const tab of group.tabs) {
    section.append(renderRow(tab));
  }

  return section;
}

function renderRow(tab) {
  const row = document.createElement('div');
  row.className = 'tab-row';
  // The later selection iteration hangs off this without reshaping the DOM.
  row.dataset.tabId = String(tab.id);

  const badge = document.createElement('span');
  badge.className = 'keeper-badge';
  badge.textContent = tab.isKeeper ? '★' : '';
  badge.title = tab.isKeeper ? `Suggested keeper — ${tab.keeperReason}` : '';

  const title = document.createElement('span');
  title.className = 'tab-title';
  title.textContent = tab.title || '(untitled)';
  title.title = tab.url;

  const where = document.createElement('span');
  where.className = 'tab-meta';
  where.textContent = `window ${windowNumbers.get(tab.windowId) ?? '?'}`;

  const when = document.createElement('span');
  when.className = 'tab-meta';
  when.textContent = relativeTime(tab.lastAccessed);

  row.append(badge, title, where, when);
  return row;
}

/** Chrome's window ids are arbitrary; show stable 1-based numbers instead. */
function numberWindows(plan) {
  const ids = new Set();
  for (const group of plan.duplicateGroups) {
    for (const tab of group.tabs) ids.add(tab.windowId);
  }
  windowNumbers = new Map([...ids].sort((a, b) => a - b).map((id, i) => [id, i + 1]));
}

function needsPermission() {
  status.textContent =
    'Tab Cleanup needs the "tabs" permission to read tab URLs. It looks like it was ' +
    'revoked — re-enable it on the extension\'s Details page, then click Rescan.';
  const empty = document.createElement('p');
  empty.className = 'empty';
  empty.textContent = 'Permission required.';
  groupsEl.replaceChildren(empty);
}

function showError(error) {
  if (error instanceof MissingTabsPermissionError) {
    needsPermission();
    return;
  }
  console.error(error);
  status.textContent = `Something went wrong: ${error.message}`;
}

// On load there is no user gesture, so only check — never request.
hasTabsPermission()
  .then((granted) => (granted ? load() : needsPermission()))
  .catch(showError);
