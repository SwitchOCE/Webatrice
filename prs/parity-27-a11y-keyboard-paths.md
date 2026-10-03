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
- **`useGridRows` waits for virtualized rows.** A focus request now stays pending until the target row's element mounts (the row's ref callback focuses it). Before, a move to a row that was not yet rendered lost focus. The existing callers (replays, card-art rules, reports, user games) behave the same.
- **VirtualRows ARIA passthrough (P17).** For a list that keeps react-window's default `role=list`, `RowsRow` now spreads react-window v2's per-row `ariaAttributes` (`role=listitem`, `aria-posinset`, `aria-setsize`). The API is confirmed in `react-window.d.ts`. So `UserRows` exposes list items. Callers that set their own role, like the games grid's `rowgroup`, keep control of their rows.
- **TopBar tabs are navigation (P3).** The tabs are now `<nav aria-label="Open tabs">` → `<ul>` → `<li>` items, each holding a `<Link aria-current=page>` and a sibling Close `<button aria-label="Close {title}">`.
  - Middle-click still closes a tab, and now calls `preventDefault` so the link doesn't open in a new browser tab.
  - Close shows on `focus-visible`.
  - There is no ARIA tablist, because there are no tab panels.
- **KnownHosts listbox (P7).** Saved hosts are a `role=listbox` of `<button role=option aria-selected>`.
  - Edit is named "Edit {host}" and becomes visible on `focus-visible`.
  - The trigger and the chevron report `aria-expanded` and `aria-controls`.
  - Picking a host or pressing Escape returns focus to the trigger.
  - The colour-only connection test result is announced through an `sr-only` `role=status` region.
- **CardCallout focus (P13).** A `[[card]]` name in chat is a `<button>` that previews on focus or hover and hides on blur, mouse-out or Escape. It is linked to the preview with `aria-describedby`.
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
  - Selectors changed: page objects now use a `topBarTab()` helper (`navigation` → `link`, with `aria-current` replacing `aria-selected`). LoginPage picks hosts by `role=option`.

## Parity rows closed
Audit accessibility rows P1, P2, P3, P7, P13, P15, P17 and P19. These are accessibility rows, not desktop-parity-matrix rows. Desktop's QTreeView/QTabBar already offer these keyboard paths, so this restores parity of input model.

## Desktop reference
- `cockatrice/src/interface/widgets/server/game_selector.cpp`: double-click on a game row runs `actJoin`. Enter does the same here.
- QTreeView key handling (arrows/Home/End move the current item, Enter activates). This is the model `useGridRows` already mirrors.
- Desktop tab bar: middle-click closes a tab. That behaviour is kept.

## Testing
Tip `0afe92d`, from the repo root:
- `npx turbo run typecheck --concurrency=1`: pass.
- `npm run lint`: pass.
- `npm test -- -- --maxWorkers=2`: sockatrice 880 passed; datatrice 1281 passed; webatrice 2213 passed, 2 skipped.
- `npm run test:integration -- -- --maxWorkers=2`: sockatrice 171 passed; datatrice 140 passed; webatrice 207 passed, 2 skipped. The first run failed because `rooms-components.spec.tsx` still imported the deleted components; that is fixed in 94a1ecb.
- New and extended specs:
  - `GamesList.spec.tsx` (5)
  - `useGridRows.spec.tsx` (+1, deferred focus)
  - `VirtualList.spec.tsx` (+2)
  - `KnownHosts.spec.tsx` (+6)
  - `TopBar.spec.tsx` (+2, existing tab assertions moved to link/`aria-current`)
  - `CardCallout.spec.tsx` (3)
  - `ShortcutsRow.spec.tsx` (2)
  - `ReportTable.spec.tsx` (+1)
- Webatrice e2e, all browsers, run in `mcr.microsoft.com/playwright:v1.60.0-noble` against Servatrice 3.0.0. The host's pre-installed browsers have no Firefox or WebKit.
  - Full run: 51 passed, 6 skipped (3.1-only), 9 failed.
  - **keyboard-only ×3:** the spec was wrong (Tab focuses a row without selecting it; Firefox wraps Tab into the browser chrome). Fixed in 0afe92d. A rerun of keyboard-only and login-join-room on chromium, firefox and webkit gave 6/6 passed.
  - **replays ×3**, `replays.spec.ts:80` (the local replay file is missing after a double-click on the match folder): pre-existing. It fails identically on the base `claude/restack-23-playmats`, with the base's own src and e2e, on chromium.
  - **staff-tools "admin publishes a new server message" ×3:** environmental. The spec shells out to `docker compose exec mysql`, and the Playwright container has no docker CLI (`spawnSync docker ENOENT`).
- Sockatrice e2e not run: no sockatrice changes.

## Notes for reviewers
- **TopBar uses `Link`, not `NavLink`.** The current tab comes from the existing `activeKey`, which falls back to the Lobby for unmatched routes. NavLink's own path matching can't express that.
- **KnownHosts listbox structure.** Each option `<button>` sits in an `<li role=presentation>` next to its Edit `<button>`, so a strict validator may flag a non-option inside the listbox. The alternative was moving Edit out of the row. Moving keyboard focus between options is plain Tab; there is no arrow-key roving inside the popup yet.
- **Virtualized tab stop.** If the user mouse-scrolls the selected row out of the rendered window, the grid has no tab stop until that row is rendered again. A fix would put the tab stop on the scroller, or use `onRowsRendered`.
- **Follow-ups (not in this PR):**
  - `features/rooms/components/Messages.tsx` is also dead: only its spec and the integration spec import it. The task scoped deletion to GameSelector, OpenGames and SayMessage.
  - GamesList's column labels and toolbar strings are still literals (i18n PR D).
  - Dialog and menu focus handling is left to PR 26 (accessibility primitives). No dialog or menu primitive was built here.
