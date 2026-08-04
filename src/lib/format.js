/** Display helpers shared by the popup and the review page. Pure. */

export function relativeTime(timestamp, now = Date.now()) {
  if (typeof timestamp !== 'number' || !Number.isFinite(timestamp)) return 'unknown';

  const seconds = Math.max(0, Math.floor((now - timestamp) / 1000));
  if (seconds < 45) return 'just now';

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${Math.max(1, minutes)}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;

  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;

  return `${Math.floor(months / 12)}y ago`;
}

export function prettyUrl(url, maxLength = 72) {
  if (!url) return '(blank)';

  let text = url;
  try {
    const parsed = new URL(url);
    // Only web URLs get shortened. chrome://newtab/ would otherwise render as
    // the bare hostname "newtab", which tells the user nothing.
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      text = parsed.hostname + (parsed.pathname === '/' ? '' : parsed.pathname) + parsed.search;
    }
  } catch {
    // Unparseable URLs show as-is.
  }

  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}

/** The copyable dry-run report — handy for pasting scan results back for tuning. */
export function planToMarkdown(plan, { dryRun = true } = {}) {
  const lines = [];

  lines.push(`# Tab Cleanup report${dryRun ? ' (DRY RUN — nothing was closed)' : ''}`);
  lines.push('');
  lines.push(`- Windows: ${plan.totals.windows}`);
  lines.push(
    `- Tabs: ${plan.totals.tabs} scanned, ${plan.totals.considered} considered` +
      (plan.totals.skippedIncognito
        ? `, ${plan.totals.skippedIncognito} incognito skipped`
        : ''),
  );
  lines.push('');

  lines.push(`## Unused new tabs — ${plan.unusedNewTabs.length} would be closed`);
  if (plan.unusedNewTabs.length === 0) lines.push('_none_');
  for (const tab of plan.unusedNewTabs) {
    lines.push(`- window ${tab.windowId} · tab ${tab.id} · \`${tab.url || '(blank)'}\``);
  }
  lines.push('');

  lines.push(`## Protected new tabs — ${plan.protectedTabs.length} kept`);
  if (plan.protectedTabs.length === 0) lines.push('_none_');
  for (const tab of plan.protectedTabs) {
    lines.push(`- window ${tab.windowId} · tab ${tab.id} · ${tab.reasons.join(', ')}`);
  }
  lines.push('');

  lines.push(`## Duplicate groups — ${plan.duplicateGroups.length} (nothing is closed)`);
  if (plan.duplicateGroups.length === 0) lines.push('_none_');
  for (const group of plan.duplicateGroups) {
    lines.push('');
    lines.push(`### ${group.key} ×${group.count}`);
    for (const tab of group.tabs) {
      const mark = tab.isKeeper ? `★ keep (${tab.keeperReason})` : 'duplicate';
      lines.push(
        `- ${mark} · window ${tab.windowId} · tab ${tab.id} · ${relativeTime(tab.lastAccessed)} · ${tab.title}`,
      );
    }
  }

  return lines.join('\n');
}
