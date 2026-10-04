# Final restack, part 3: the platform a11y and i18n PRs (26, 27, 28) onto the game chain

## Summary

The three platform PRs that were built in parallel on `restack-23-playmats` (`13351fd`) now sit
above the refactor/game line, one linear chain on `claude/restack-17b-game-menus` (`41f0d47`, w17r's
final tip, per M1):

| row | PR | branch | tip | commits |
|---|---|---|---|---|
| 1 | 26 a11y primitives | `claude/restack-26-a11y-primitives` | `35919ab` | 30 |
| 2 | 27 a11y keyboard paths | `claude/restack-27-a11y-keyboard-paths` | `8e5174d` | 13 |
| 3 | 28 i18n gate | `claude/restack-28-i18n-gate` | `bcced39` | 17 |
| 4 | 25a platform prefs | not done | — | — |

Row 4 (25a) waits on the orchestrator's "25a ready" mailbox message, which had not arrived when rows
1–3 were gated (inbox M1, M2 only).

Each row was replayed by cherry-picking its `13351fd..<branch>` commits in order onto the new tip
of the row before it. Every commit of every row typechecks (`tsc` for `src` and `e2e`), lints its
changed files (the whole tree where `eslint.config.mjs` or the lockfile changed), and has a
`src/i18n-default.json` that matches a fresh `npm run translate`. From 28's gate commit on,
`i18n:check` passes at every commit too. The rows were first built on `65687b0` and moved to
`41f0d47` with `git rebase --onto` once M1 arrived. That commit touches only
`e2e/fixtures/network.ts`, so there were no conflicts.

### History edits carried from the reviews

- **26 (rv13/rv14):** `0a0ab4d`'s `integration/src/features/player.spec.tsx` change and `542cf5d`'s
  `browser-support.spec.ts` fix are folded into `f6ac60e`'s replacement, which passes the whole
  webatrice integration suite (271/271). What is left of `0a0ab4d` is the changeset, reworded
  `chore(changeset): add the a11y primitives changeset`, and `542cf5d` is gone. `36cd584` is split
  into `fix(a11y): hand the opener across swapped dialogs` (hook + unit spec) and
  `test(a11y): keyboard-only moderator action e2e`. `08393d9`'s ToastContext hunk is folded into
  `5e81593`, and its `i18n-default.json` hunk into `ef177d5`, which added those keys, so
  `08393d9` is gone.
- **27 (rv11/f27):** `94a1ecb` (the integration spec and the RoomsPage comment) is folded into the
  commit that deletes GameSelector, OpenGames and SayMessage (`baf3b91`), so the integration suite
  imports at every commit. Right after it,
  `test(rooms): port the deleted GameSelector toolbar coverage to GamesList` adds 10 specs (listed
  in 27's PR file).
- **28:** its own GameSelector/OpenGames/SayMessage deletion became a no-op: those files were
  already gone, nothing is re-added, and the commit message now says so. `9c81e97`
  (logo decorative) was empty once replayed and is dropped: 27 had already made the logo and
  avatars `alt=""`. Two commits are new:
  - `fix(game): write the tally count as an ICU plural`, placed before the gate. The checker found
    a game-chain `{{count}}` message, i18next's own syntax, which i18next-icu renders literally.
  - fx16's `a472e86` (`test(game): wait for the link dialog to close before clicking Back`),
    cherry-picked last with its message kept, per M2. The final restack folds it into PR 16.

- **e2e selector (26 × 17b):** `e2e/specs/card-menus.spec.ts`, added by the game chain, opens
  Settings from the TopBar user menu with `getByRole('button')`. 26's commit that turns that menu
  into a `Menu` (`feat(a11y): shared keyboard Menu, used by the user and TopBar menus`) now also
  changes this one selector to `menuitem`, as it already did for the e2e page objects.

### Conflict resolutions (lower PR's fix wins, both behaviours kept)

- **UserActionsMenu (26 × 23d).** 23d's "View this user's public decks" moved onto 26's `Menu`. For
  another user it is a NavLink `menuitem` with `tabIndex=-1`, like Private chat. For yourself it
  is first an `aria-disabled` `menuitem`, and from `ef177d5` on a disabled `MenuItem` whose
  `disabledReason` is the new `UserActionsMenu.viewPublicDecksSelf` ("Your own decks are in My
  Decks.").
- **PrivateChat (26 × game chain).** The bubble keeps 26's `sr-only` sender and renders the message
  through the game chain's `renderGameLinks`.
- **useShortcutHints / menuShortcut (26 × 05's Cmd-on-macOS fix).** There is one platform probe:
  `menuShortcut.ts` uses `shortcutSequence.isMacPlatform`, and 26's duplicate `isMacUA` is gone.
- **TopBar (26 × 27 × 28 × deck work):** 27's `<nav>`/`<ul>`/`Link` tabs, with these choices:
  - the close button stays undimmed (26's contrast fix);
  - 28's `titleKey` titles are translated at render time in the tab list, in the Close label and,
    newly, in `document.title`, with a spec added;
  - the deck work's "Unsaved deck" and "Public decks of {name}" tabs are keyed too
    (`TopBar.tab.unsavedDeck`, `TopBar.tab.publicDecks`);
  - the connection dot keeps 26's persistent `role=status`, and 28's seconds-bearing `aria-label`
    is dropped;
  - 28's `TopBar.closeTab` gives way to 27's `TopBar.tabs.close`.
- **GamesList / FilterGamesDialog / CreateGameDialog / RoomChat (27 × 26 × 28).** Each file keeps
  its structure from the lower PR and takes 28's keys:
  - GamesList keeps 27's grid and header buttons, labelled by 28's `GamesList.column.*`;
  - FilterGamesDialog stays on 26's DialogShell (28 had translated the old hand-rolled portal);
  - CreateGameDialog keeps 27's `useId` group labels;
  - RoomChat and PrivateChat keep 26's `log`/`input` keys for both the placeholder and the label,
    and 28's duplicate `placeholder` key is dropped.
- **DialogShell / Toast (26 × 28).** 28's shared `Common.action.close` / `Common.action.dismiss`
  replace 26's `DialogShell.close` / `Toast.dismiss`. The `DialogShell` catalogue was left empty,
  so it is deleted.
- **Login / Initialize (27 × 28).** The logo and avatars stay decorative (27). The orphaned
  `Common.label.logo` and `Login.showcase.avatarAlt` are not added, and 28's duplicate
  `KnownHosts.edit` is dropped for 27's `Edit {name}`.

No platform folder needed extra extraction: with the rule on, `npm run lint` reports 0 problems at
the `b8cabd1` and `00bfdba` replacements and at the tip. Every literal the game chain added outside
`features/game` and `features/decks` was already translated. The one exception was the two TopBar
tab titles, which live in object literals the jsx-only rule does not see; they are keyed above.
`TODO(PR26)`: 27 left none.

## Parity rows closed

None beyond the three PRs' own (audit P1–P19, LONG-016 partial). Each PR file carries a
`## Restack notes (wR3)` section.

## Desktop reference

Unchanged from the PR files. The public-decks entry still follows desktop `UserContextMenu`:
registered users only, disabled for yourself.

## Testing

At the 28 tip `bcced39`, from the repo root, after `git submodule update --init && npm ci`:

- `npx turbo run typecheck --concurrency=1`: 5/5 tasks.
- `npm run lint`: 3/3 packages, 0 problems. `npm run -w @cockatrice/webatrice i18n:check`: 99
  catalogues, 718 sources, all keys resolve.
- `npm test -- -- --maxWorkers=2`: sockatrice **896**, datatrice **1316**, webatrice **3764**
  passed.
- `npm run test:integration -- -- --maxWorkers=2`: sockatrice **175**, datatrice **145**, webatrice
  **270** passed.
- Per commit, all 60 commits: tsc (src+e2e), eslint, i18n rollup, and `i18n:check` from the gate on.
  Rows 2–3 also ran `rooms-components`/`rooms` (row 2) and `rooms-components`/`player` (row 3)
  integration specs at every commit. Rows 1–2 were checked before the move to `41f0d47` and the
  card-menus selector fix. Both edits are e2e-only (the network fixture and one spec line), so
  after each one `tsc -p e2e` was re-run at the tips and at the amended Menu commit.
- `invite-link.spec.tsx` "Back returns to the room" is flaky on the base `65687b0` (2/5 and 4/5
  failures). fx16's fix (M2) makes it 8/8 here.
- `npm run test:e2e -w @cockatrice/webatrice`: build on the host, Servatrice 3.0.0 via `test:e2e:up`,
  browsers in `mcr.microsoft.com/playwright:v1.60.0-noble` (chromium, firefox, webkit). The full run
  on the pre-fix tip gave **81 passed, 12 skipped, 6 failed** (99 tests, 24 min):
  - `card-menus.spec.ts` "Alt+1 sends the first message macro" ×3. This was a real restack
    regression: the game chain's spec clicked the TopBar user menu's Settings entry as a `button`,
    which 26 made a `menuitem`. It is fixed in 26's Menu commit (see below), and the spec re-run on
    the final tip is **9/9 passed**. The fix changes only that spec line, so the rest of the run
    stands for the final tip.
  - `staff-tools.spec.ts:39` ×3: `spawnSync docker ENOENT`. The spec seeds SQL through the docker
    CLI, which the Playwright container lacks. This is environmental and known from the 26/27/28
    runs.
  - `replays.spec.ts`, which failed in the 26/27/28 runs, passes on this base.
- Sockatrice e2e not run: no sockatrice change in these rows.

## Notes for reviewers

- The new `fix(game)` ICU commit touches `features/game`. It is in 28 because 28's gate is what
  rejects the message; it could equally move down into 17a/17b in the final restack.
- `Common.action.close` is absent at the `4a76bd4` replacement (its only user there, the old
  FilterGamesDialog header, is DialogShell's now) and arrives with `c8cb154`, where DialogShell
  uses it, so `i18n:check` has no orphan at either commit.
- Follow-ups: row 4 (25a) once "25a ready" arrives; fold `a472e86` into PR 16 in the final restack.
