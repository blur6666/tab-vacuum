/**
 * `tabs` is a REQUIRED permission (see manifest.json). It is granted at install
 * time, so nothing here ever prompts.
 *
 * It used to be optional, requested inside a click gesture. That was dropped
 * deliberately — see "Permissions" in README.md. The short version: `tabs`
 * carries the "Read your browsing history" warning either way, because it is
 * the permission that un-redacts `url` on every tab. Making it optional moved
 * that warning from install time to a mid-session dialog without removing it,
 * which is strictly worse UX for the same disclosure.
 */

const TABS = { permissions: ['tabs'] };
const TAB_GROUPS = { permissions: ['tabGroups'] };

/** True whenever the extension is installed normally. */
export function hasTabsPermission() {
  return chrome.permissions.contains(TABS);
}

/**
 * `tabGroups` IS optional, so unlike the two above these are the real thing.
 *
 * It buys one cosmetic upgrade: group headings read "Work" in the group's own
 * colour instead of "group 1". It carries its own install warning — "View and
 * manage your tab groups" — which is why it is not required. Declining costs
 * nothing but the labels; per-group deduplication reads `tab.groupId`, which
 * needs no permission at all.
 */
export function hasTabGroupsPermission() {
  return chrome.permissions.contains(TAB_GROUPS);
}

/**
 * MUST be the first statement of a click handler, with no `await` before it.
 * An intervening await consumes the user gesture and the request fails — the
 * mistake CLAUDE.md records for when `tabs` was optional.
 */
export function requestTabGroupsPermission() {
  return chrome.permissions.request(TAB_GROUPS);
}
