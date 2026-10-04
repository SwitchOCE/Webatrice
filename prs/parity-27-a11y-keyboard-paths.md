# fix(a11y): keyboard paths for platform lists and nav

## Summary
This closes the audit's P1 keyboard blocker: a game can now be joined without a mouse. It also covers the rest of audit PR "B" for the platform tree (spec `aud.md` §1.1 and §3 row B).

- **GamesList is a keyboard grid (P1, P2).** The list moves from `role=table` with clickable divs to `role=grid` on `useGridRows`, the same model the replay and report tables use:
  - One roving tab stop, with `aria-selected` and `aria-rowindex`, and `aria-rowcount` = visible games + header.
  - ↑/↓/Home/End move the selection, and Space selects.
  - Enter joins, like desktop's double-click.
  - Sortable headers are `<button>`s inside `columnheader`, which carries `aria-sort`, as in ReportTable.
  - Because the body is virtualized, a keyboard move calls `scrollToRow` on the react-window list ref.
  - Joining now looks the game up by id. Before, Enter or double-click on a row that was not yet selected would have used the stale selection.
- **`useGridRows` keeps a rendered tab stop.** Virtualized callers pass the list's `onRowsRendered` range back to the hook (`VirtualRows` forwards it to react-window). While the selected row is outside the rendered window, the first visible row holds the tab stop, so Tab always enters the grid; selection is unchanged. Callers that never report a range behave as before.
- **`useGridRows` waits for virtualized rows.** A focus request now stays pending until the target row's element mounts (the row's ref callback focuses it). Before, a move to a row that was not yet rendered lost focus. The existing callers (replays, card-art rules, reports, user games) behave the same.
- **VirtualRows ARIA passthrough (P17).** For a list that keeps react-window's default `role=list`, `RowsRow` now spreads react-window v2's per-row `ariaAttributes` (`role=listitem`, `aria-posinset`, `aria-setsize`). The API is confirmed in `react-window.d.ts`. So `UserRows` exposes list items. Callers that set their own role, like the games grid's `rowgroup`, render their rows bare: `renderRow` receives react-window's positioning `style` and spreads it on the `role=row` element, so rows are direct children of the rowgroup (GamesList, ManageSets).
- **TopBar tabs are navigation (P3).** The tabs are now `<nav aria-label="Open tabs">` → `<ul>` → `<li>` items, each holding a `<Link aria-current=page>` and a sibling Close `<button aria-label="Close {title}">`.
  - Middle-click still closes a tab, and now calls `preventDefault` so the link doesn't open in a new browser tab.
  - Close shows on `focus-visible`.
  - There is no ARIA tablist, because there are no tab panels.
- **KnownHosts listbox (P7).** Saved hosts are an APG single-select listbox: one tab stop that points at its active option with `aria-activedescendant`.
  - ↑/↓/Home/End move the active option (starting on the selected host), typing a name prefix jumps to a host, and Enter or Space picks it. Options are plain clickable `<li role=option aria-selected>`.
  - A single Edit button after the listbox, named "Edit {host}", acts on the selected host (shown only when it is editable).
  - The trigger and the chevron report `aria-expanded` and `aria-controls`.
  - Picking a host or pressing Escape returns focus to the trigger.
  - The colour-only connection test result is announced through an `sr-only` `role=status` region.
- **CardCallout focus (P13).** A `[[card]]` name in chat is a `<button>` that previews on focus or hover and hides on blur, mouse-out or Escape. Its `aria-describedby` points at an `sr-only` summary inside the preview (type line and P/T), and is omitted when the card has neither.
  - The preview moved from a modal MUI `Popover` to a non-modal `Popper` with the same corner placement. The Popover's modal manager sets `aria-hidden` on the rest of the page, which would have hidden the focused name.
- **P15 batch:**
  - Decorative logos and stock avatars (Login, Initialize) and CountryDropdown flags get `alt=""`.
  - The UserDisplay flag's alt is the translated country, not the raw code. Player's flag is decorative because the code is printed beside it.
  - The CardImportForm dropzone no longer has `role=button` around a real Browse button.
  - The CardRelatedLinks token toggle reports `aria-expanded` and `aria-controls`.
  - Labelled groups and grids: Player moderation actions (`role=group`), CreateGameDialog sections and the game-type radiogroup (`aria-labelledby`), and ReportTable (new required `label` prop).
  - ShortcutsRow: Edit and Reset are named after the row's action, and a conflict is spelled out in `sr-only` text.
- **Dead code (P19).** Deleted `GameSelector/*`, `OpenGames` (+css/spec) and `SayMessage` (+spec). They were imported only by their own specs and by `integration/src/features/rooms-components.spec.tsx`, which now mounts `GamesList` instead.
- **e2e.** Added `specs/keyboard-only.spec.ts`: it logs in, joins a room and joins a game using only Tab, Shift+Tab, arrows, Space and Enter. The setup (registering the account, and the host creating the game) is mouse-driven.
  - Selectors changed: page objects now use a `topBarTab()` helper (`navigation` → `link`, with `aria-current` replacing `aria-selected`). LoginPage picks hosts by `role=option`. The keyboard spec tabs to the listbox, types the host name and checks `aria-activedescendant` before Enter.

## Parity rows closed
Audit accessibility rows P1, P2, P3, P7, P13, P15, P17 and P19. These are accessibility rows, not desktop-parity-matrix rows. Desktop's QTreeView/QTabBar already offer these keyboard paths, so this restores parity of input model.

## Desktop reference
- Desktop `GameSelector`: double-clicking a game row joins it (the join path `useJoinGame` already mirrors from `GameSelector::joinGame`). Enter does the same here. Source file path not re-checked in this run.
- QTreeView key handling (arrows/Home/End move the current item, Enter activates). This is the model `useGridRows` already mirrors.
- Desktop tab bar: middle-click closes a tab. That behaviour is kept.

## Testing
Tip `aee9592`, from the repo root:
- `npx turbo run typecheck --concurrency=1`: pass.
- `npm run lint`: pass.
- `npm test -- -- --maxWorkers=2`: sockatrice 880 passed; datatrice 1281 passed; webatrice 2224 passed, 2 skipped.
- `npm run test:integration -- -- --maxWorkers=2`: sockatrice 171 passed; datatrice 140 passed; webatrice 207 passed, 2 skipped. Green at the tip; not green at the commits between baf3b91 and 94a1ecb (see Review response).
- New and extended specs:
  - `GamesList.spec.tsx` (5)
  - `useGridRows.spec.tsx` (+2: deferred focus, tab stop re-homed to a visible row)
  - `VirtualList.spec.tsx` (+3)
  - `KnownHosts.spec.tsx` (18 total; the listbox keyboard specs use user-event, and the 7 new ones fail on the pre-fix component)
  - `TopBar.spec.tsx` (+2, existing tab assertions moved to link/`aria-current`)
  - `CardCallout.spec.tsx` (5)
  - `ShortcutsRow.spec.tsx` (2)
  - `ReportTable.spec.tsx` (+1)
- Webatrice e2e, all browsers, in `mcr.microsoft.com/playwright:v1.60.0-noble` against Servatrice 3.0.0: **54 passed, 6 skipped (3.1-only), 6 failed**. keyboard-only and login-join-room pass on chromium, firefox and webkit.
  - **replays ×3** (`replays.spec.ts:80`, local replay file missing): pre-existing, fails identically on the base `claude/restack-23-playmats`.
  - **staff-tools "admin publishes a new server message" ×3:** environmental; the spec shells out to `docker compose exec mysql` and the Playwright container has no docker CLI (`spawnSync docker ENOENT`).
- Sockatrice e2e not run: no sockatrice changes.

## Review response (rv11)
- **major, KnownHosts not a real listbox** → implemented the APG listbox: one tab stop, `aria-activedescendant`, ↑/↓/Home/End, type-ahead, Enter/Space pick; Edit moved out to one control after the listbox acting on the selected host. Specs with user-event (+7), keyboard e2e updated. (eac5fd2)
- **minor, GamesList tab stop lost when scrolled** → `useGridRows` re-homes the tab stop to the first visible row via the rendered-range callback; selection unchanged; other callers unaffected. Spec +1. (bdc9e73)
- **minor, bisectability** → not done in this run: rewriting history was blocked by the session's permissions. Deferred to the restack worker wR3, which folds 94a1ecb into baf3b91 when it replays 27 (orchestrator M1).
- **minor, VirtualList wrapper div** → roled lists pass `style` into `renderRow` and render rows bare. Spec +1. (2c9f43a)
- **nit, CardCallout description** → `sr-only` type line / P/T summary as the described-by target. Specs +2. (3905cb6)
- **nit, changeset** → `minor`, text updated. (aee9592)

## Notes for reviewers
- **TopBar uses `Link`, not `NavLink`.** The current tab comes from the existing `activeKey`, which falls back to the Lobby for unmatched routes. NavLink's own path matching can't express that.
- **KnownHosts uses `aria-activedescendant`, not roving tabindex**, matching ManageSets' grid. Type-ahead resets after 500 ms. `@testing-library/user-event` is added as a webatrice dev dependency for the keyboard specs.
- **Commit history.** `baf3b91` (deletion) and `94a1ecb` (integration spec update) are still separate, so the integration suite cannot import at the four commits between them. The squash is deferred to the restack (wR3).
- **Follow-ups (not in this PR):**
  - `features/rooms/components/Messages.tsx` is also dead: only its spec and the integration spec import it. The task scoped deletion to GameSelector, OpenGames and SayMessage.
  - GamesList's column labels and toolbar strings are still literals (i18n PR D).
  - Dialog and menu focus handling is left to PR 26 (accessibility primitives). No dialog or menu primitive was built here.

## Restack notes (wR3)

Restacked onto the new 26 as `claude/restack-27-a11y-keyboard-paths` (tip `8e5174d`, 13 commits). The changes:
- `94a1ecb` is folded into the deletion commit (`fix(a11y): join a game from the keyboard`). The integration suite imports, and the rooms integration specs pass, at every commit.
- **TopBar.** The tabs keep 26's undimmed Close button and `document.title`. The game chain's unsaved-deck tab test now uses links.
- **Two TopBar specs** now scope their Close-button query to the replay tab's `<li>`, because the deck-draft tab can also be open.
- **UserDisplay.** The flag's translated `alt` is combined with 26's `menu.getTriggerProps()`.

**Coverage port** (`test(rooms): port the deleted GameSelector toolbar coverage to GamesList`, directly after the deletion). These tests in `GamesList.spec.tsx` run against the live component:
1. keeps Join disabled until a game is selected
2. disables Join and Spectate while a join is pending
3. disables Join when the selected game is full
4. disables Spectate when the game allows no spectators
5. shows the judge buttons only to a user with the IsJudge flag (hidden for a plain user)
6. shows both judge buttons to a judge
7. applies the filter dialog to the room
8. cancels the filter dialog without touching the filters
9. dispatches clearGameFilters from Clear filter
10. submits createGame from the create dialog

`useJoinGame.spec` already covers the password prompt, full-game spectate, already-open routing and join errors. 28 later moves these specs onto i18n keys.
