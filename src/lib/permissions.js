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

/** True whenever the extension is installed normally. */
export function hasTabsPermission() {
  return chrome.permissions.contains(TABS);
}

/**
 * Kept so the click handlers do not need to know how `tabs` was granted.
 *
 * Deliberately does NOT call chrome.permissions.request(): that function throws
 * for any permission not declared in `optional_permissions`, and `tabs` is now
 * required. contains() resolves true with no dialog.
 *
 * If `tabs` is ever moved back to optional_permissions, this must go back to
 * calling request() as the first statement of the click handler with no `await`
 * before it — an intervening await consumes the user gesture and the request
 * fails.
 */
export function requestTabsPermission() {
  return chrome.permissions.contains(TABS);
}
