import { queryAllTabs, openReviewPage } from '../lib/chrome-tabs.js';
import { requestTabsPermission } from '../lib/permissions.js';
import { planCleanup, MissingTabsPermissionError } from '../lib/scan.js';
import { closeTabs } from '../lib/execute.js';
import { planToMarkdown, prettyUrl } from '../lib/format.js';

const $ = (id) => document.getElementById(id);

const scanButton = $('scan');
const status = $('status');
const results = $('results');
const toggleProtected = $('toggle-protected');
const protectedList = $('protected-list');
const openReview = $('open-review');
const copyButton = $('copy');

let lastPlan = null;

scanButton.addEventListener('click', () => {
  // First statement, no await before it: an intervening await would consume
  // the user gesture and chrome.permissions.request() would fail. Resolves
  // true without prompting when the permission is already held.
  const granted = requestTabsPermission();

  scanButton.disabled = true;
  setStatus('Scanning…');

  granted
    .then((ok) => (ok ? scan() : denied()))
    .catch(showError)
    .finally(() => {
      scanButton.disabled = false;
    });
});

async function scan() {
  const tabs = await queryAllTabs();
  const plan = planCleanup(tabs);
  lastPlan = plan;

  // Dry run: this closes nothing and only reports what it would have closed.
  const outcome = closeTabs(plan.unusedNewTabs.map((tab) => tab.id));

  render(plan, outcome);
}

function render(plan, outcome) {
  setStatus('');
  results.classList.toggle('hidden', false);

  $('totals').textContent =
    `Scanned ${plan.totals.considered} tabs · ${plan.totals.windows} window` +
    `${plan.totals.windows === 1 ? '' : 's'}` +
    (plan.totals.skippedIncognito ? ` · ${plan.totals.skippedIncognito} incognito skipped` : '');

  $('new-tab-count').textContent = String(outcome.wouldClose.length);
  $('new-tab-windows').textContent = plan.unusedNewTabs.length
    ? describePerWindow(plan.unusedNewTabs)
    : 'No unused new tabs found.';

  renderProtected(plan.protectedTabs);

  const duplicateTabs = plan.duplicateGroups.reduce((sum, group) => sum + group.count, 0);
  $('duplicate-count').textContent = String(plan.duplicateGroups.length);
  $('duplicate-summary').textContent = plan.duplicateGroups.length
    ? `${plan.duplicateGroups.length} group${plan.duplicateGroups.length === 1 ? '' : 's'}` +
      ` · ${duplicateTabs} tabs. Nothing is closed.`
    : 'No duplicate tabs found.';
  openReview.classList.toggle('hidden', plan.duplicateGroups.length === 0);
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
      'If the prompt closed this popup, re-open it — the permission is already granted.',
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
  return [...perWindow.values()].map((count, i) => `win ${i + 1} · ${count}`).join('   ');
}
