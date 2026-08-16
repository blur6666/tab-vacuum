/**
 * Tab Cleanup popup.
 *
 * Provides:
 * 1. "Scan my tabs" / "Scan again" -> Scans and shows breakdown, with link to Review page.
 * 2. "Vacuum 'em all!" -> One-click scan & delete for broader junk + duplicate tabs
 *    with a two-click confirmation.
 */

import { queryAllTabs, openReviewPage } from '../lib/chrome-tabs.js';
import { requestTabsPermission } from '../lib/permissions.js';
import { planCleanup, MissingTabsPermissionError } from '../lib/scan.js';
import { planVacuum } from '../lib/vacuum.js';
import { closeTabs } from '../lib/execute.js';
import { planToMarkdown, prettyUrl } from '../lib/format.js';
import { DEBUG_LOG_SCANNED_TABS, CONFIRM_REVERT_MS } from '../lib/config.js';

const $ = (id) => document.getElementById(id);

const SCAN = 'Scan my tabs';
const SCAN_AGAIN = '⟳ Scan again';
const VACUUM = "Vacuum 'em all!";

const scanButton = $('scan');
const vacuumButton = $('vacuum');
const status = $('status');
const results = $('results');
const toggleProtected = $('toggle-protected');
const protectedList = $('protected-list');
const openReview = $('open-review');
const copyButton = $('copy');

let lastPlan = null;
let vacuumPlan = null;
let armedVacuumTimer = null;

scanButton.textContent = SCAN;
vacuumButton.textContent = VACUUM;

scanButton.addEventListener('click', () => {
  disarmVacuum();
  const granted = requestTabsPermission();

  scanButton.disabled = true;
  vacuumButton.disabled = true;
  setStatus('Scanning…');

  granted
    .then((ok) => (ok ? scan() : denied()))
    .catch(showError)
    .finally(() => {
      scanButton.disabled = false;
      vacuumButton.disabled = false;
    });
});

vacuumButton.addEventListener('click', async () => {
  if (vacuumButton.classList.contains('armed')) {
    await executeVacuum();
    return;
  }

  const granted = await requestTabsPermission();
  if (!granted) {
    denied();
    return;
  }

  scanButton.disabled = true;
  vacuumButton.disabled = true;
  setStatus('Scanning for duplicates & junk…');

  try {
    const tabs = await queryAllTabs();
    if (DEBUG_LOG_SCANNED_TABS) {
      console.log(`Vacuum scan: ${tabs.length} tabs`, tabs);
    }
    const result = planVacuum(tabs);
    vacuumPlan = result;

    if (result.totalClosable === 0) {
      setStatus('Nothing to vacuum — no duplicate or junk tabs found.');
      disarmVacuum();
      return;
    }

    armVacuum(result.totalClosable);
    setStatus(
      `Found ${result.totalClosable} tab${result.totalClosable === 1 ? '' : 's'} to vacuum ` +
        `(${result.junkTabs.length} junk, ${result.totalClosable - result.junkTabs.length} duplicate${result.totalClosable - result.junkTabs.length === 1 ? '' : 's'}).`,
    );
  } catch (error) {
    showError(error);
    disarmVacuum();
  } finally {
    scanButton.disabled = false;
    vacuumButton.disabled = false;
  }
});

function armVacuum(count) {
  disarmVacuum();
  vacuumButton.textContent = `Closing ${count} tab${count === 1 ? '' : 's'}, ok?`;
  vacuumButton.classList.add('armed');
  armedVacuumTimer = setTimeout(() => {
    disarmVacuum();
  }, CONFIRM_REVERT_MS);
}

function disarmVacuum() {
  if (armedVacuumTimer) {
    clearTimeout(armedVacuumTimer);
    armedVacuumTimer = null;
  }
  vacuumButton.textContent = VACUUM;
  vacuumButton.classList.remove('armed');
  vacuumPlan = null;
}

async function executeVacuum() {
  if (!vacuumPlan) return;
  const currentVacuum = vacuumPlan;
  disarmVacuum();

  scanButton.disabled = true;
  vacuumButton.disabled = true;
  setStatus('Closing tabs…');

  try {
    const result = await closeTabs(currentVacuum.plan, currentVacuum.closableIds);
    if (result.closed > 0) {
      setStatus(
        `Closed ${result.closed} tab${result.closed === 1 ? '' : 's'}. ` +
          `Ctrl+Shift+T reopens them if needed.`,
      );
    } else {
      setStatus('Nothing was closed.');
    }

    if (!results.classList.contains('hidden')) {
      await scan();
    }
  } catch (error) {
    showError(error);
  } finally {
    scanButton.disabled = false;
    vacuumButton.disabled = false;
  }
}

async function scan() {
  const tabs = await queryAllTabs();
  if (DEBUG_LOG_SCANNED_TABS) {
    console.log(`Tab Cleanup: scanned ${tabs.length} tabs`, JSON.parse(JSON.stringify(tabs)));
  }
  const plan = planCleanup(tabs);
  lastPlan = plan;

  render(plan);
}

function render(plan) {
  setStatus('');
  results.classList.toggle('hidden', false);

  scanButton.textContent = SCAN_AGAIN;
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
    'Tab Cleanup needs the "tabs" permission to read tab URLs. Nothing else is accessed. ' +
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
