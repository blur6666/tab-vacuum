/**
 * Tab Vacuum popup.
 *
 * Provides:
 * 1. "Scan my tabs" / "Scan again" -> Scans and shows breakdown, with link to Review page.
 * 2. "Vacuum 'em all!" -> One-click scan & delete; then shows the tabs closed
 *    or skipped and refreshes the report.
 */

import { queryAllTabs, openReviewPage } from '../lib/chrome-tabs.js';
import { hasTabsPermission, requestTabsPermission } from '../lib/permissions.js';
import { planCleanup, MissingTabsPermissionError } from '../lib/scan.js';
import { planVacuum } from '../lib/vacuum.js';
import { planToMarkdown, prettyUrl } from '../lib/format.js';
import { DEBUG_LOG_SCANNED_TABS } from '../lib/config.js';

const $ = (id) => document.getElementById(id);

const SCAN = 'Scan my tabs';
const SCAN_AGAIN = '⟳ Scan again';
const VACUUM = "Vacuum 'em all!";

const SCAN_TOOLTIP = 'Inspect and review duplicate, junk, and system tabs — closes nothing on its own';
const SCAN_AGAIN_TOOLTIP = 'Re-scan all tabs and refresh the report in place';
const VACUUM_TOOLTIP = "Instant 1-click cleanup: scans and closes duplicate, junk, and system tabs across all windows";

const scanButton = $('scan');
const vacuumButton = $('vacuum');
const vacuumOutcome = $('vacuum-outcome');
const vacuumOutcomeList = $('vacuum-outcome-list');
const status = $('status');
const results = $('results');
const toggleProtected = $('toggle-protected');
const protectedList = $('protected-list');
const openReview = $('open-review');
const copyButton = $('copy');
const helpBtn = $('help-btn');

let lastPlan = null;

scanButton.textContent = SCAN;
scanButton.title = SCAN_TOOLTIP;
scanButton.setAttribute('aria-label', `Scan my tabs: ${SCAN_TOOLTIP.toLowerCase()}`);

vacuumButton.textContent = VACUUM;
vacuumButton.title = VACUUM_TOOLTIP;
vacuumButton.setAttribute('aria-label', `Vacuum 'em all: ${VACUUM_TOOLTIP.toLowerCase()}`);

// The popover is hover-only by default (:hover/:focus-within in CSS); these
// keep aria-expanded honest for anyone using a screen reader, which does not
// otherwise learn that hovering revealed content.
helpBtn?.addEventListener('mouseenter', () => {
  helpBtn.setAttribute('aria-expanded', 'true');
});

helpBtn?.addEventListener('mouseleave', () => {
  if (document.activeElement !== helpBtn) {
    helpBtn.setAttribute('aria-expanded', 'false');
  }
});

helpBtn?.addEventListener('focus', () => {
  helpBtn.setAttribute('aria-expanded', 'true');
});

helpBtn?.addEventListener('blur', () => {
  helpBtn.setAttribute('aria-expanded', 'false');
});

// Initial disabled state, from the same fresh count every other path uses.
hasTabsPermission().then(async (granted) => {
  if (!granted) return;
  try {
    const state = await chrome.runtime.sendMessage({ type: 'vacuum-state' });
    if (state.status === 'running') {
      scanButton.disabled = true;
      vacuumButton.disabled = true;
      setStatus('Scanning and vacuuming…');
      await waitForVacuum();
    } else if (state.status === 'complete' || state.status === 'error') {
      await showVacuumState(state);
    } else {
      await refreshVacuumState();
    }
  } catch { }
});

scanButton.addEventListener('click', () => {
  const granted = requestTabsPermission();

  scanButton.disabled = true;
  vacuumButton.disabled = true;
  setStatus('Scanning…');

  granted
    .then((ok) => (ok ? scan() : denied()))
    .catch(showError)
    .finally(() => {
      scanButton.disabled = false;
    });
});

vacuumButton.addEventListener('click', async () => {
  scanButton.disabled = true;
  vacuumButton.disabled = true;
  clearVacuumOutcome();
  setStatus('Scanning and vacuuming…');

  try {
    if (!await requestTabsPermission()) {
      denied();
      return;
    }
    await showVacuumState(await chrome.runtime.sendMessage({ type: 'vacuum-start' }));
  } catch (error) {
    showError(error);
    vacuumButton.disabled = false;
  } finally {
    scanButton.disabled = false;
  }
});

async function waitForVacuum() {
  let state;
  do {
    await new Promise((resolve) => setTimeout(resolve, 100));
    state = await chrome.runtime.sendMessage({ type: 'vacuum-state' });
  } while (state.status === 'running');
  await showVacuumState(state);
}

async function showVacuumState(state) {
  scanButton.disabled = false;
  if (state.status === 'error') {
    showError(new Error(state.error));
    vacuumButton.disabled = false;
    return;
  }
  if (state.status !== 'complete') return;
  const { outcome, rows } = state;
  // Refresh failure must never hide the successful deletion report.
  try {
    await scan();
  } catch (error) {
    console.warn('Could not refresh scan after Vacuum', error);
    vacuumButton.disabled = false;
  }
  renderVacuumOutcome(outcome, new Map(rows.map((row) => [row.id, row])));
  setStatus(rows.length === 0 ? 'No tabs to clean up.' :
    `Vacuum complete: closed ${outcome.closed} tab${outcome.closed === 1 ? '' : 's'}; ` +
    `skipped ${outcome.skipped.length}.`);
}

async function refreshVacuumState() {
  const tabs = await queryAllTabs();
  vacuumButton.disabled = planVacuum(tabs).totalClosable === 0;
}

async function scan() {
  clearVacuumOutcome();
  const tabs = await queryAllTabs();
  if (DEBUG_LOG_SCANNED_TABS) {
    console.log(`Tab Vacuum: scanned ${tabs.length} tabs`, JSON.parse(JSON.stringify(tabs)));
  }
  const plan = planCleanup(tabs);
  lastPlan = plan;

  const vacuumRes = planVacuum(tabs);
  vacuumButton.disabled = vacuumRes.totalClosable === 0;

  render(plan);
}

function renderVacuumOutcome(outcome, plannedRows) {
  const rows = [
    ...outcome.closedIds.map((id) => ({
      id,
      text: `Closed: ${formatVacuumTab(plannedRows.get(id))}`,
      url: plannedRows.get(id)?.url,
    })),
    ...outcome.skipped.map(({ id, reason }) => ({
      id,
      text: `Skipped: ${formatVacuumTab(plannedRows.get(id))} — ${reason}`,
      url: plannedRows.get(id)?.url,
    })),
  ];

  vacuumOutcomeList.replaceChildren(
    ...rows.map(({ id, text, url }) => {
      const li = document.createElement('li');
      li.textContent = text;
      if (url) li.title = url;
      return li;
    }),
  );
  vacuumOutcome.classList.toggle('hidden', false);
}

function formatVacuumTab(tab) {
  return tab ? `${tab.title || prettyUrl(tab.url)} — ${tab.why}` : 'tab no longer available';
}

function clearVacuumOutcome() {
  vacuumOutcome.classList.toggle('hidden', true);
  vacuumOutcomeList.replaceChildren();
}

function render(plan) {
  setStatus('');
  results.classList.toggle('hidden', false);

  scanButton.textContent = SCAN_AGAIN;
  scanButton.title = SCAN_AGAIN_TOOLTIP;
  scanButton.setAttribute('aria-label', `Scan again: ${SCAN_AGAIN_TOOLTIP.toLowerCase()}`);
  scanButton.className = 'secondary';

  $('totals').textContent =
    `Scanned ${plan.totals.considered} tabs · ${plan.totals.windows} window` +
    `${plan.totals.windows === 1 ? '' : 's'}` +
    (plan.totals.skippedIncognito ? ` · ${plan.totals.skippedIncognito} incognito skipped` : '');

  $('new-tab-count').textContent = String(plan.unusedNewTabs.length);
  $('new-tab-windows').textContent = plan.unusedNewTabs.length
    ? describePerWindow(plan.unusedNewTabs)
    : 'No unused new tabs found.';

  const systemTabs = plan.systemTabs ?? [];
  $('system-tab-count').textContent = String(systemTabs.length);
  $('system-tab-summary').textContent = systemTabs.length
    ? describePerWindow(systemTabs)
    : 'No system tabs found.';

  renderProtected([...plan.protectedTabs, ...(plan.protectedSystemTabs ?? [])]);

  const duplicateTabs = plan.duplicateGroups.reduce((sum, group) => sum + group.count, 0);
  $('duplicate-count').textContent = String(plan.duplicateGroups.length);
  $('duplicate-summary').textContent = plan.duplicateGroups.length
    ? `${plan.duplicateGroups.length} group${plan.duplicateGroups.length === 1 ? '' : 's'}` +
    ` · ${duplicateTabs} tabs`
    : 'No duplicate tabs found.';

  const hasAnything =
    plan.unusedNewTabs.length > 0 || systemTabs.length > 0 || plan.duplicateGroups.length > 0;
  openReview.classList.toggle('hidden', !hasAnything);
}

function renderProtected(protectedTabs) {
  const hasAny = protectedTabs.length > 0;
  toggleProtected.classList.toggle('hidden', !hasAny);
  protectedList.classList.toggle('hidden', true);

  if (!hasAny) {
    protectedList.replaceChildren();
    return;
  }

  toggleProtected.textContent = `${protectedTabs.length} protected — why?`;

  const items = protectedTabs.map((tab) => {
    const li = document.createElement('li');
    li.textContent = `${prettyUrl(tab.url)} — ${tab.reasons.join(', ')}`;
    return li;
  });
  protectedList.replaceChildren(...items);
}

toggleProtected.addEventListener('click', () => {
  protectedList.classList.toggle('hidden');
});

openReview.addEventListener('click', () => {
  openReviewPage();
  window.close();
});

copyButton.addEventListener('click', async () => {
  if (!lastPlan) return;
  await navigator.clipboard.writeText(planToMarkdown(lastPlan));
  copyButton.textContent = '✓ Copied';
  setTimeout(() => {
    copyButton.textContent = '⧉ Copy report';
  }, 1500);
});

function denied() {
  setStatus(
    'Tab Vacuum needs the "tabs" permission to read tab URLs. Nothing else is accessed. ' +
    'It looks like it was revoked — re-enable it on the extension\'s Details page.',
  );
}

function showError(error) {
  if (error instanceof MissingTabsPermissionError) {
    denied();
    return;
  }
  console.error(error);
  setStatus(`Something went wrong: ${error.message}`);
}

function setStatus(text) {
  status.textContent = text;
}

function describePerWindow(tabs) {
  const perWindow = new Map();
  for (const tab of tabs) {
    perWindow.set(tab.windowId, (perWindow.get(tab.windowId) ?? 0) + 1);
  }
  // Numbered for display only — Chrome's window ids are not meaningful to users.
  return [...perWindow.values()].map((count, i) => `win ${i + 1} · ${count}`).join('\n');
}
