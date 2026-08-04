/**
 * `tabs` is an optional permission, so the extension installs with no warning
 * at all and only asks once the user actually clicks the button.
 */

const TABS = { permissions: ['tabs'] };

/** For page load, where no user gesture is available. Never prompts. */
export function hasTabsPermission() {
  return chrome.permissions.contains(TABS);
}

/**
 * Must be the FIRST statement in a click handler, with no `await` before it —
 * an intervening await consumes the user gesture and the request fails.
 *
 * Resolves true without prompting when the permission is already held, so
 * there is no need to call hasTabsPermission() first.
 */
export function requestTabsPermission() {
  return chrome.permissions.request(TABS);
}
