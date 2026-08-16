- [DONE] Show ALL tabs on the report. Add a filter to choose only the ones subject for deletion. Leave this filter ON as default

- [DONE] Add the number (id?) of the group for each tab so I can see that in the table (if you also have color or name, put that in a column too)

- [DONE] Add to CLAUDE.md that the styling for .md files is NOT to breakline after 80 chars, but to go on without breaklines the whole paragrapher. 

- [DONE] Change label from the first button to "Scan my tabs". Then  after it has already scanned one time (but didnt move to the report yet) the label should be "Scan again". See images in the tmp/ folder. Delete the folder after this task is done. — `tmp/` kept by decision on 2026-08-06; it is gitignored, so it never reaches the repo.

- [DONE] Lets remove the closing protection for new-tabs that are "active" it makes no sense.

- [TECH VIABLE?] Can we read the data of when was the tab  opened and when was it last accessed? Im thinking in some way to kill forgotten or "hoarded" tabs

- [DONE] Nothing runs `npm test` automatically. No CI, no pre-commit hook. `test/guards.test.js` is described in CLAUDE.md as a structural guarantee — only `chrome-tabs.js` may close a tab, the manifest may not grow past `tabs` + optional `tabGroups` — but today that guarantee is only "somebody remembered to run the tests". A push or PR that adds a second close path, a host permission or a content script goes green on GitHub, because GitHub runs nothing. The gap is in the process, not the code: the guards work, they just are not wired to anything. Fix: a GitHub Actions workflow running `npm test` on every push and pull request, on the oldest Node the guard tests actually support and on current. — `.github/workflows/test.yml`, added 2026-08-16.
