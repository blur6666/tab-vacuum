import { queryAllTabs, getSelfTabId, queryGroupsById } from '../lib/chrome-tabs.js';
import {
  hasTabsPermission,
  requestTabsPermission,
  hasTabGroupsPermission,
  requestTabGroupsPermission,
} from '../lib/permissions.js';
import { MissingTabsPermissionError, TAB_GROUP_ID_NONE } from '../lib/scan.js';
import { planVacuum } from '../lib/vacuum.js';
import { closeTabs, bulkSelection, closableTabs } from '../lib/execute.js';
import { relativeTime, planToMarkdown, prettyUrl } from '../lib/format.js';
import { CONFIRM_REVERT_MS } from '../lib/config.js';

const $ = (id) => document.getElementById(id);

const JUNK_TYPE_LABELS = {
  extension: 'extension page',
  internal: 'internal page',
  error: 'error page',
  auth_or_transactional: 'sign-in / checkout',
};

const groupsEl = $('groups');
const newTabsEl = $('new-tabs');
const junkTabsEl = $('junk-tabs');
const otherTabsEl = $('other-tabs');
const onlyActionable = $('only-actionable');
const summary = $('summary');
const status = $('status');
const outcome = $('outcome');
const actionBar = $('action-bar');
const selectionCount = $('selection-count');
const closeSelected = $('close-selected');
const vacuumEmAll = $('vacuum-em-all');
const groupNamesButton = $('group-names');

let lastPlan = null;
let selfTabId = null;
let windowNumbers = new Map();
let groupNumbers = new Map();
let tabGroups = new Map();

/** Tab ids the user has ticked. Survives a re-render, cleared after a close. */
const selected = new Set();

/* ------------------------------------------------------------------ scan */

/**
 * No snapshot is passed from the popup — with no storage permission and no
 * service worker, re-running the scan here is both simpler and always fresh.
 */
async function load() {
  status.textContent = 'Scanning…';

  const [tabs, self, groups] = await Promise.all([
    queryAllTabs(),
    getSelfTabId(),
    queryGroupsById(),
  ]);

  selfTabId = self;
  tabGroups = groups;

  const { plan } = planVacuum(tabs, { selfTabId: self });
  lastPlan = plan;

  // A tab that vanished between scans must not stay ticked.
  const stillOffered = closableTabs(plan);
  for (const id of [...selected]) {
    if (!stillOffered.has(id)) selected.delete(id);
  }

  numberWindows(plan);
  numberGroups(plan);
  render(plan);
}

/* ---------------------------------------------------------------- render */

function render(plan) {
  status.textContent = '';
  disarmAll();

  const duplicateTabs = plan.duplicateGroups.reduce((sum, group) => sum + group.count, 0);
  const newTabs = (plan.junkTabs ?? []).filter((tab) => tab.junkType === 'new_tab');
  const otherJunk = (plan.junkTabs ?? []).filter((tab) => tab.junkType !== 'new_tab');
  const parts = [];
  if (newTabs.length) parts.push(`${newTabs.length} unused new tabs`);
  if (otherJunk.length) parts.push(`${otherJunk.length} other junk`);
  if (plan.duplicateGroups.length) {
    parts.push(
      `${plan.duplicateGroups.length} duplicate group` +
        `${plan.duplicateGroups.length === 1 ? '' : 's'} · ${duplicateTabs} tabs`,
    );
  }
  summary.textContent = parts.length
    ? `${parts.join(' · ')} across ${plan.totals.windows} window` +
      `${plan.totals.windows === 1 ? '' : 's'} · ${plan.totals.considered} tabs scanned`
    : `Scanned ${plan.totals.considered} tabs. Nothing to clean up.`;

  renderNewTabs(plan);
  renderJunk(plan);
  renderDuplicates(plan);
  renderOther(plan);

  const hasAnything =
    newTabs.length > 0 || otherJunk.length > 0 || plan.duplicateGroups.length > 0;
  $('empty').classList.toggle('hidden', hasAnything);
  actionBar.classList.toggle('hidden', !hasAnything);

  // Only worth offering when there is actually a group to name.
  const hasGrouped = everyReportedTab(plan).some((tab) => tab.groupId !== TAB_GROUP_ID_NONE);
  hasTabGroupsPermission()
    .then((granted) => {
      groupNamesButton.classList.toggle('hidden', granted || !hasGrouped);
    })
    .catch(() => groupNamesButton.classList.add('hidden'));

  updateSelectionUi();
}

function renderNewTabs(plan) {
  const rows = [
    ...(plan.junkTabs ?? [])
      .filter((tab) => tab.junkType === 'new_tab')
      .map((tab) => renderRow(tab, { label: prettyUrl(tab.url) })),
    ...(plan.protectedJunkTabs ?? [])
      .filter((tab) => tab.junkType === 'new_tab')
      .map((tab) => renderRow(tab, { label: prettyUrl(tab.url), protections: tab.reasons })),
  ];

  newTabsEl.replaceChildren(...rows);
  $('new-tabs-section').classList.toggle('hidden', rows.length === 0);
}

function renderJunk(plan) {
  const rows = [
    ...(plan.junkTabs ?? [])
      .filter((tab) => tab.junkType !== 'new_tab')
      .map((tab) =>
        renderRow(tab, {
          label: tab.title || prettyUrl(tab.url),
          note: JUNK_TYPE_LABELS[tab.junkType] ?? null,
        }),
      ),
    ...(plan.protectedJunkTabs ?? [])
      .filter((tab) => tab.junkType !== 'new_tab')
      .map((tab) =>
        renderRow(tab, { label: tab.title || prettyUrl(tab.url), protections: tab.reasons }),
      ),
  ];

  junkTabsEl.replaceChildren(...rows);
  $('junk-section').classList.toggle('hidden', rows.length === 0);
}

function renderDuplicates(plan) {
  groupsEl.replaceChildren(...plan.duplicateGroups.map(renderGroup));
  $('duplicates-section').classList.toggle('hidden', plan.duplicateGroups.length === 0);
}

/**
 * Every tab the scan looked at and had nothing to offer for. Hidden behind the
 * filter, which starts on: the common case is "what can I close", and the full
 * list is context you ask for.
 */
function renderOther(plan) {
  const others = plan.otherTabs ?? [];
  const show = !onlyActionable.checked && others.length > 0;

  otherTabsEl.replaceChildren(
    ...(show
      ? others.map((tab) =>
          renderRow(tab, { label: tab.title || prettyUrl(tab.url), note: tab.reason }),
        )
      : []),
  );
  $('other-section').classList.toggle('hidden', !show);
}

function renderGroup(group) {
  const section = document.createElement('section');
  section.className = 'group';

  const head = document.createElement('div');
  head.className = 'group-head';

  const key = document.createElement('span');
  key.className = 'group-key';
  key.textContent = group.key;

  const meta = document.createElement('span');
  meta.className = 'group-meta';

  const where = groupLabel(group.groupId);
  const chip = document.createElement('span');
  chip.className = 'group-chip';
  chip.textContent = where.text;
  chip.title = where.title;
  if (where.color) chip.style.setProperty('--chip', where.color);
  meta.append(chip);

  const selectAll = document.createElement('button');
  selectAll.type = 'button';
  selectAll.className = 'link';
  selectAll.textContent = 'select all';
  selectAll.title = 'Ticks every closable copy except the ★';
  selectAll.addEventListener('click', () => {
    toggleSelection(group.tabs.filter((tab) => tab.closable && !tab.isKeeper).map((t) => t.id));
  });

  const count = document.createElement('span');
  count.className = 'group-count';
  count.textContent = `×${group.count}`;

  meta.append(selectAll, count);
  head.append(key, meta);
  section.append(head);

  for (const tab of group.tabs) {
    section.append(renderRow(tab, { protections: tab.protections }));
  }

  return section;
}

function renderRow(tab, { label = null, protections = [], note = null } = {}) {
  const row = document.createElement('label');
  row.className = 'tab-row';
  row.dataset.tabId = String(tab.id);

  const blocked = !tab.closable;
  if (blocked) row.classList.add('protected');

  const box = document.createElement('input');
  box.type = 'checkbox';
  box.className = 'tick';
  box.disabled = blocked;
  box.checked = selected.has(tab.id);
  box.addEventListener('change', () => {
    if (box.checked) selected.add(tab.id);
    else selected.delete(tab.id);
    updateSelectionUi();
  });

  const badge = document.createElement('span');
  badge.className = 'keeper-badge';
  badge.textContent = tab.isKeeper ? '★' : '';
  if (tab.isKeeper) badge.title = `Suggested keeper — ${tab.keeperReason}`;

  const title = document.createElement('span');
  title.className = 'tab-title';
  title.textContent = label ?? tab.title ?? '(untitled)';
  title.title = tab.url;

  const notes = document.createElement('span');
  notes.className = 'tab-notes';
  if (blocked && protections.length > 0) {
    notes.classList.add('warn');
    notes.textContent = `⚠ ${protections.join(', ')}`;
    notes.title = 'Protected — cannot be closed from here. Tune it in src/lib/config.js';
  } else if (note) {
    // Not a protection and not a warning — just why this row has no checkbox.
    notes.textContent = note;
  } else if (tab.closesWindow) {
    notes.classList.add('warn');
    notes.textContent = '⚠ closes its window';
    notes.title = 'The only tab in its window — closing it closes the window too.';
  }

  const group = tabGroupCell(tab.groupId);

  const where = document.createElement('span');
  where.className = 'tab-meta';
  where.textContent = `window ${windowNumbers.get(tab.windowId) ?? '?'}`;

  const when = document.createElement('span');
  when.className = 'tab-meta';
  when.textContent = relativeTime(tab.lastAccessed);

  row.append(box, badge, title, notes, group, where, when);
  return row;
}

/**
 * The per-tab group column. Same label as the group heading, except that
 * "ungrouped" would be noise repeated down a whole column — a dash says it.
 */
function tabGroupCell(groupId) {
  const cell = document.createElement('span');
  cell.className = 'tab-meta tab-group';

  const label = groupLabel(groupId);
  const ungrouped = groupId === undefined || groupId === TAB_GROUP_ID_NONE;

  cell.textContent = ungrouped ? '—' : label.text;
  cell.title = label.title;
  if (label.color) cell.style.color = label.color;

  return cell;
}

/* ------------------------------------------------------------- selection */

function toggleSelection(ids) {
  const allOn = ids.length > 0 && ids.every((id) => selected.has(id));

  for (const id of ids) {
    if (allOn) selected.delete(id);
    else selected.add(id);
  }

  syncCheckboxes();
  updateSelectionUi();
}

function syncCheckboxes() {
  for (const row of document.querySelectorAll('.tab-row')) {
    const box = row.querySelector('.tick');
    if (!box.disabled) box.checked = selected.has(Number(row.dataset.tabId));
  }
}

function updateSelectionUi() {
  const count = selected.size;

  selectionCount.textContent = count
    ? `${count} tab${count === 1 ? '' : 's'} selected`
    : 'Nothing selected';
  closeSelected.disabled = count === 0;

  if (count === 0) disarm(closeSelected);
}

for (const button of document.querySelectorAll('.select-all')) {
  button.addEventListener('click', () => {
    if (!lastPlan) return;

    const ids =
      button.dataset.scope === 'new-tabs'
        ? (lastPlan.junkTabs ?? [])
            .filter((tab) => tab.junkType === 'new_tab' && tab.closable)
            .map((tab) => tab.id)
        : button.dataset.scope === 'junk'
          ? (lastPlan.junkTabs ?? [])
              .filter((tab) => tab.junkType !== 'new_tab' && tab.closable)
              .map((tab) => tab.id)
          : lastPlan.duplicateGroups.flatMap((group) =>
              group.tabs.filter((tab) => tab.closable && !tab.isKeeper).map((tab) => tab.id),
            );

    toggleSelection(ids);
  });
}

// Purely a view toggle — re-renders the plan already in hand rather than
// rescanning, so the selection survives showing and hiding the rest.
onlyActionable.addEventListener('change', () => {
  if (lastPlan) render(lastPlan);
});

/* --------------------------------------------------------------- closing */

/**
 * Two-click arm-then-fire. Deliberately not `confirm()`: a native dialog
 * blocks every extension event until it is dismissed, and cannot be driven
 * from an automated run.
 */
const armed = new Map();

function arm(button, prompt, action) {
  if (armed.has(button)) {
    disarm(button);
    action();
    return;
  }

  disarmAll();

  const label = button.textContent;
  const timer = setTimeout(() => disarm(button, label), CONFIRM_REVERT_MS);

  armed.set(button, { label, timer });
  button.textContent = prompt;
  button.classList.add('armed');
}

function disarm(button, label) {
  const state = armed.get(button);
  if (!state) return;

  clearTimeout(state.timer);
  armed.delete(button);
  button.textContent = label ?? state.label;
  button.classList.remove('armed');
}

function disarmAll() {
  for (const button of [...armed.keys()]) disarm(button);
}

closeSelected.addEventListener('click', () => {
  if (selected.size === 0) return;
  arm(closeSelected, `Close ${selected.size}? — click again`, () => run([...selected]));
});

vacuumEmAll.addEventListener('click', () => {
  if (!lastPlan) return;

  // Tick everything it would take, so the second click confirms a selection
  // the user can actually see.
  const ids = bulkSelection(lastPlan);
  if (ids.length === 0) return;

  for (const id of ids) selected.add(id);
  syncCheckboxes();
  updateSelectionUi();

  arm(vacuumEmAll, `Closing ${ids.length}? — click again`, () => run(ids));
});

async function run(ids) {
  status.textContent = 'Closing…';
  closeSelected.disabled = true;
  vacuumEmAll.disabled = true;

  try {
    const result = await closeTabs(lastPlan, ids, { selfTabId });
    selected.clear();
    reportOutcome(result);
    await load();
  } catch (error) {
    showError(error);
  } finally {
    vacuumEmAll.disabled = false;
    closeSelected.disabled = selected.size === 0;
  }
}

function reportOutcome(result) {
  outcome.classList.remove('hidden');

  const lines = [
    result.closed
      ? `Closed ${result.closed} tab${result.closed === 1 ? '' : 's'} — Ctrl+Shift+T reopens them one at a time.`
      : 'Nothing was closed.',
  ];

  if (result.skipped.length) {
    lines.push(
      `Skipped ${result.skipped.length}: ` +
        result.skipped.map((s) => `tab ${s.id} (${s.reason})`).join(', '),
    );
  }

  outcome.textContent = lines.join(' ');
}

/* ----------------------------------------------------------- group names */

/**
 * How a tab group is written wherever it appears: `g3`, or `g3 · Work` in the
 * group's own colour once the optional `tabGroups` permission is granted.
 *
 * The number is ours and stable across the report; the browser's own group id
 * is arbitrary, so it lives in the tooltip — that is the value the copied
 * markdown report prints, which is the only reason to want it.
 */
function groupLabel(groupId) {
  if (groupId === undefined || groupId === TAB_GROUP_ID_NONE) {
    return { text: 'ungrouped', color: null, title: 'not in a tab group' };
  }

  const number = groupNumbers.get(groupId) ?? '?';
  const group = tabGroups.get(groupId);

  return {
    text: group?.title ? `g${number} · ${group.title}` : `g${number}`,
    color: GROUP_COLORS[group?.color] ?? null,
    title:
      `tab group ${groupId}` +
      (group?.title ? ` — "${group.title}"` : '') +
      (group?.color ? ` (${group.color})` : ''),
  };
}

/** Chrome reports group colours by name, not by value. */
const GROUP_COLORS = {
  grey: '#5f6368',
  blue: '#1a73e8',
  red: '#d93025',
  yellow: '#f9ab00',
  green: '#1e8e3e',
  pink: '#d01884',
  purple: '#9334e6',
  cyan: '#007b83',
  orange: '#fa903e',
};

groupNamesButton.addEventListener('click', () => {
  // FIRST statement, no await ahead of it — an intervening await consumes the
  // user gesture and the request silently fails. See permissions.js.
  requestTabGroupsPermission()
    .then((granted) => (granted ? load() : undefined))
    .catch(showError);
});

/* ----------------------------------------------------------------- chrome */

rescanHandlers();

function rescanHandlers() {
  $('rescan').addEventListener('click', () => {
    // `tabs` is required, so this never prompts — it re-checks in case the
    // permission was revoked from the Details page while this tab sat open.
    requestTabsPermission()
      .then((ok) => (ok ? load() : needsPermission()))
      .catch(showError);
  });

  $('copy').addEventListener('click', async () => {
    if (!lastPlan) return;
    await navigator.clipboard.writeText(planToMarkdown(lastPlan));
    $('copy').textContent = '✓ Copied';
    setTimeout(() => {
      $('copy').textContent = '⧉ Copy report';
    }, 1500);
  });
}

/** Every tab the plan reports, whatever section it lands in. */
function everyReportedTab(plan) {
  return [
    ...(plan.junkTabs ?? []),
    ...(plan.protectedJunkTabs ?? []),
    ...(plan.otherTabs ?? []),
    ...plan.duplicateGroups.flatMap((group) => group.tabs),
  ];
}

/** Chrome's window ids are arbitrary; show stable 1-based numbers instead. */
function numberWindows(plan) {
  const ids = new Set(everyReportedTab(plan).map((tab) => tab.windowId));

  windowNumbers = new Map([...ids].sort((a, b) => a - b).map((id, i) => [id, i + 1]));
}

/**
 * Same trick for group ids. Numbered across every reported tab, not just the
 * duplicate buckets, so g1 means the same group in every section — including
 * the ones only visible with the filter off.
 */
function numberGroups(plan) {
  const ids = new Set(
    everyReportedTab(plan)
      .map((tab) => tab.groupId)
      .filter((id) => id !== undefined && id !== TAB_GROUP_ID_NONE),
  );

  groupNumbers = new Map([...ids].sort((a, b) => a - b).map((id, i) => [id, i + 1]));
}

function needsPermission() {
  status.textContent =
    'Tab Cleanup needs the "tabs" permission to read tab URLs. It looks like it was ' +
    'revoked — re-enable it on the extension\'s Details page, then click Rescan.';
  actionBar.classList.add('hidden');
  groupsEl.replaceChildren();
  newTabsEl.replaceChildren();

  const empty = $('empty');
  empty.classList.remove('hidden');
  empty.textContent = 'Permission required.';
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
