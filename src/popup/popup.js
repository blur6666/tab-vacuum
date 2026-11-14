/**
 * Tab Vacuum popup.
 *
 * Provides:
 * 1. "Scan my tabs for junks and dupes" / "Scan again" -> Scans and shows breakdown, with link to Review page.
 * 2. "Vacuum 'em all!" -> One-click scan & delete; then shows the tabs closed
 *    or skipped, without showing the scan breakdown.
 */

import { queryAllTabs, getActiveTabId, openReviewPage } from '../lib/chrome-tabs.js';
import { hasTabsPermission } from '../lib/permissions.js';
import { planCleanup, MissingTabsPermissionError } from '../lib/scan.js';
import { closeTabs } from '../lib/execute.js';
import { planVacuum, vacuumPreview } from '../lib/vacuum.js';
import { planToMarkdown, prettyUrl } from '../lib/format.js';
import { DEBUG_LOG_SCANNED_TABS } from '../lib/config.js';

const $ = (id) => document.getElementById(id);

const SCAN = 'Scan my tabs for junks and dupes';
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
const helpPopover = $('help-popover');

let lastPlan = null;

scanButton.textContent = SCAN;
scanButton.title = SCAN_TOOLTIP;
scanButton.setAttribute('aria-label', `Scan my tabs for junks and dupes: ${SCAN_TOOLTIP.toLowerCase()}`);

vacuumButton.textContent = VACUUM;
vacuumButton.title = VACUUM_TOOLTIP;
vacuumButton.setAttribute('aria-label', `Vacuum 'em all: ${VACUUM_TOOLTIP.toLowerCase()}`);

// Match the accessibility state to the same hover/focus state that reveals
// the tooltip visually, and associate its text only while it is available.
function syncHelpVisibility() {
  const visible = helpBtn.parentElement.matches(':hover, :focus-within');
  helpBtn.setAttribute('aria-expanded', String(visible));
  helpPopover.setAttribute('aria-hidden', String(!visible));
  if (visible) helpBtn.setAttribute('aria-describedby', helpPopover.id);
  else helpBtn.removeAttribute('aria-describedby');
}

helpBtn?.addEventListener('mouseenter', syncHelpVisibility);
helpBtn?.addEventListener('mouseleave', syncHelpVisibility);
helpBtn?.addEventListener('focus', syncHelpVisibility);
helpBtn?.addEventListener('blur', syncHelpVisibility);

// Initial disabled state, from the same fresh count every other path uses.
hasTabsPermission().then(async (granted) => {
  if (!granted) return;
  try {
    await refreshVacuumState();
  } catch { }
});

scanButton.addEventListener('click', () => {
  const granted = hasTabsPermission();

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
  results.classList.toggle('hidden', true);
  setStatus('Scanning and vacuuming…');

  try {
    if (!await hasTabsPermission()) {
      denied();
      return;
    }
    const tabs = await queryAllTabs();
    const vacuumPlan = planVacuum(tabs);
    const popupTabId = await getActiveTabId();
    const outcome = await closeTabs(vacuumPlan.plan, vacuumPlan.closableIds, {
      selfTabId: popupTabId,
    });
    await showVacuumResult({ outcome, rows: vacuumPlan.rows });
  } catch (error) {
    showError(error);
    vacuumButton.disabled = false;
  } finally {
    scanButton.disabled = false;
  }
});

async function showVacuumResult({ outcome, rows }) {
  scanButton.disabled = false;
  results.classList.toggle('hidden', true);
  // Refresh only the button state; the scan breakdown belongs to Scan.
  try {
    await refreshVacuumState();
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

  vacuumButton.disabled = vacuumPreview(plan).length === 0;

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
