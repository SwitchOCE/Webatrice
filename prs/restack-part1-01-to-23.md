# Final restack, part 1: 01 … 23-playmats as one linear chain

## Summary

The sixteen review-fixed parity branches from `01-lint` through `23-playmats` are now one
linear chain in the series merge order, each rebased onto the new tip of the one before it and
pushed as `claude/restack-<NN-name>`. `01` and `02` are unchanged; every later branch was replayed
with `git rebase --onto`, so each still carries exactly its own PR's commits (10, 3, 10, 9, 12, 11,
11, 13, 8, 28, 23, 21, 18, 17, 5, 16 — `14` is f14's final `claude/parity-14-reports`).

Three series-wide decisions were carried out while resolving:

- **Failure pattern.** `#03`'s scope-level `commandFailed(command, responseCode, target)` plus
  Datatrice's `<scope>CommandFailed` signals is the single mechanism. `#04` adds the optional
  fourth `failure` (the transport reason), `#13` extends it to the admin and developer scopes and
  the staff lookups, and `#14`'s duplicate session-scope copy is folded into `#03`'s. All four
  scopes end with one signature; the instructions text introduces it in `#03` and extends it in
  `#13`/`#14`.
- **Grid/keyboard rows.** `#15`'s `useGridRows` is introduced at `#11` (the first branch that needs
  it) in `@app/hooks`, and `#13` (card-art rules), `#15` (replay lists), `#14` (report tables) and
  `#20` (token and picture-URL lists) all use it. `#20`'s ManageSets keeps its own
  `aria-activedescendant` model: it is a virtualized multi-select grid whose focused row can
  unmount.
- **Dexie versions** stay monotonic: v5 replays (`#15`) → v6 settings (`#19`) → v7 card data
  (`#20`), with `#19`'s merge-order note preserved.

## Parity rows closed

None directly: this is the mechanical restack of the series. The parity rows are those of the
sixteen PRs in the chain; their PR files carry a `## Restack notes (wR1)` section with the
resolutions that touched them.

## Desktop reference

Only where a resolution had to pick behaviour: `tab_server.cpp` (`joinRoom` /
`joinRoomFinished`, `setCurrent = false` for auto-joins), `user_context_menu.cpp` (the admin lock
and the report entry in one menu), `appearance_settings_page.cpp` ("Playmat settings" as a group of
the Appearance page) and `QTreeView`/`QListView` key handling (the shared grid hook).

## Testing

Run from the repo root, at the stated tips.

- `npx turbo run typecheck --concurrency=1`: green at **every commit** of 03, 12, 04, 10, 11, 13,
  06, 15, 14, 19, 21, 20, 24 and 23 (checked commit by commit, not just the tips).
- `npm run lint`: green at the tips of 03, 12, 04, 10, 11, 13, 06, 15, 14, 19, 21, 20, 24, 23.
- `npm test` (unit) at the final tip (23): sockatrice **880**, datatrice **1281**, webatrice
  **2232 passed, 2 skipped**.
- `npm run test:integration` at the final tip: sockatrice **171**, datatrice **140**, webatrice
  **209 passed, 2 skipped**.
- Unit + integration also green at the tips of 13 (838/1215/1530 + 170/137/165), 06
  (840/1216/1534 + 170/137/165), 14 (859/1267/1737 + 170/139/184) and 20 (859/1267/2143 +
  170/139/209).
- `npm run test:e2e -w @cockatrice/sockatrice`: **5 passed** (4 files).
- `npm run test:e2e -w @cockatrice/webatrice` at the final tip, chromium + firefox + webkit:
  **57 passed, 6 skipped, 0 failed** (10.2 min). Run in the pre-pulled
  `mcr.microsoft.com/playwright:v1.60.0-noble` image with the host Docker socket and CLI mounted,
  which `staff-tools.spec.ts` needs for its MySQL seed.

Two real defects the restack produced were found this way and fixed in the owning commit:

- `#21`'s catalogue language codes (`en_US`) reached `#15`'s `Intl.NumberFormat` in
  `LocalReplays`, which threw and crashed the Replays page in all three browsers. The size
  formatter now goes through `toBcp47` (fixed in `#21`'s `feat(i18n): expose every shipped
  catalogue…`).
- `#20`'s restacked import graph made `FeatureDetection.spec`'s `@app/services` mock incomplete
  (`mergeCardSources` reads `USER_TOKENS_SOURCE_ID` at module load); the mock is now partial via
  `importOriginal`.

## Notes for reviewers

- Each branch's own PR file gained a `## Restack notes (wR1)` section listing every non-trivial
  resolution against it, so a reviewer reading one PR sees what the restack changed in it.
- Per the orchestrator's correction, `#11`'s lobby dialog is the single join-room failure surface
  **and** carries `#04`'s review fix: sockatrice always reports
  `joinRoomFailed(roomId, code, failure, userInitiated)`, and `#11`'s reducer drops a failed
  auto-join (desktop shows no message for `setCurrent = false`). `#04`'s specs for it are restored,
  and its other review fix (the notice queue clearing on disconnect) is kept with its spec
  re-expressed on create-game and deck-upload failures.
- `#23`'s playmat settings lost their own tab: `#19` replaces the tabbed Settings page with the
  section registry, so `PlaymatSettingsPanel` is registered as the "Playmat settings" group of the
  Appearance section (desktop's own location) through a block custom control. Its preferences still
  live in their own `localStorage` key — migrating them into the typed settings row is the
  follow-up `#23` already names.
- `src/i18n-default.json` is generated; it was regenerated with
  `npm run translate -w @cockatrice/webatrice` in every commit that touched a catalogue, and no
  commit in the chain contains a conflict marker (checked with `git log -p` over the whole range).
- `#24`'s preflight entry keeps `#21`'s boot work: `index.tsx` only reads the preflight result and
  dynamic-imports `boot.tsx`, which carries the console capture, the debug-log header, the boot
  colour scheme and `AppThemeProvider`.
