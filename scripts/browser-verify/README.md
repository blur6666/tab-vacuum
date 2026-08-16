# Browser verification

Two scripts that load the extension unpacked in a real Chromium and drive the popup. They exist because both bugs found on 2026-08-16 — `chrome://newtab/` being offered as a closable system tab, and the Vacuum confirm showing 7 of 33 rows — passed the whole `node --test` suite. Neither is reachable without a browser at real popup dimensions.

| Script | Checks |
| --- | --- |
| `confirm-lists-targets.mjs` | The armed confirm names the tabs it will close, decoys stay out of it, and firing the second click closes those tabs and nothing else. |
| `confirm-fits-popup.mjs` | With 33 tabs queued, the list still shows its rows inside Chrome's 600px popup cap and leaves the button on screen — CLAUDE.md rule 2. |

## Running them

Playwright is **not** a dependency of this project and must not become one without the decision in TASK-2. Install it outside the repo, as README.md prescribes, and run from there:

```bash
mkdir -p ~/pw && cd ~/pw && npm init -y && npm install playwright
node /path/to/tab-vacuum/scripts/browser-verify/confirm-lists-targets.mjs
```

Nothing here runs during `npm test`. `node --test` only discovers files under `test/`, which is why these live in `scripts/`.

## Notes

- **Throw-away profile, always.** Both scripts `mkdtemp` a fresh `--user-data-dir`. Never point them at a real profile — they close tabs, and CLAUDE.md says so twice.
- **`TABVAC_CHROME`** overrides the browser binary. The default is Playwright's bundled Chromium at `/opt/pw-browsers/chromium/chrome-linux/chrome`; set the variable when yours lives elsewhere, or when the bundled build does not match the installed Playwright.
- **No network.** Pages are served from a local `http` server on loopback, because duplicate detection only accepts `http:`/`https:` and `data:` URLs cannot stand in.
- **Finding the extension id** reads `chrome://extensions-internals/` and matches `name === 'Tab Vacuum'`. Do not take the first id in that dump — Edge ships built-in extensions that appear first. The scripts used to match two names, because the manifest said `Tab Vacuum` while the UI said `Tab Cleanup`; that drift is gone.
- Screenshots land in `tmp/`, which is gitignored.
