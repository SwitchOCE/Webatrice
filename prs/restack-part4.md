# Final restack, part 4a: 25a and the R/25b line onto the game chain

## Summary

The platform-prefs PR (25a), the board-prefs PR (25b) and the four audit refactors that stack on the
game chain (R1, R2, R6, R4) now continue the one linear chain above 28 (wR4a):

| row | PR | branch | tip | commits (was) |
|---|---|---|---|---|
| — | 16 game lobby (+ fx16) | `claude/restack-16-game-lobby` | `a472e86` | +1 |
| — | 17a game actions | `claude/restack-17a-game-actions` | `4fcdf8d` | 16 |
| — | 17b game menus | `claude/restack-17b-game-menus` | `0b80cec` | 31 |
| — | 26 a11y primitives | `claude/restack-26-a11y-primitives` | `d92b0aa` | 30 |
| — | 27 a11y keyboard paths | `claude/restack-27-a11y-keyboard-paths` | `edf8c2e` | 13 |
| — | 28 i18n gate | `claude/restack-28-i18n-gate` | `4626393` | 16 (17) |
| 1 | 25a platform prefs | `claude/restack-25a-platform-prefs` | `c9c05e9` | 14 (18) |
| 2 | R1 card-ops seam | `claude/restack-r1-card-ops-seam` | `331dfc9` | 24 |
| 3 | 25b board prefs | `claude/restack-25b-board-prefs` | `7dd9b95` | 40 (42) |
| 4 | R2 zone-view family | `claude/restack-r2-zone-view-family` | `d30b7af` | 13 |
| 5 | R6 game listeners | `claude/restack-r6-game-listeners` | `2ed4d62` | 7 |
| 6 | R4 Scryfall catalog | `claude/restack-r4-scryfall-catalog` | `30fbee1` | 15 |

### Below row 1

- **fx16 folded into 16.** `a472e86` (`test(game): wait for the link dialog to close before clicking
  Back`) sits on `d2e516c` already, so it is now PR 16's last commit. 17a/17b/26/27/28 were replayed
  on it (no conflicts; only `invite-link.spec.tsx` differs from the old trees). The copy wR3
  cherry-picked at the end of 28 (`bcced39`) is dropped, and so is w25b's copy (`af3cfc1`).
- **26–28 on f17's 17b.** f17 added four commits each to 17a and 17b after wR3 stacked 26–28 on
  `41f0d47`; `git rebase --onto` moved them with no conflicts.
- **17b's red commits (found by the per-commit typecheck).** f17's
  `docs(game): say where the play-to-stack preference enters playCardMove` also deleted
  `features/game/hooks/useMessageMacros.ts`, two commits before
  `refactor(game): read message macros from @app/hooks` moved its two readers off it, so two
  commits did not typecheck. The deletion now lives in that later commit; the tip tree is unchanged.

### History edits in row 1 (25a, rv21)

- `f70f45a`, `734ecf0` and `de1dd81` are squashed into `4cbea4b`
  (`feat(settings): startup tab, missing-feature notice and replay rewind buffer`), together with
  `f437ae5`'s e2e hunk (re-select the host after signing out). The message describes all four.
- The `CommittedInput` change was already in `4cbea4b`'s tree; only `8701aae`'s message claimed it,
  and that paragraph now sits in `4cbea4b`'s message.
- `f437ae5` keeps only its changeset line.
- `bf310a1` is dropped: it edited 25a's old-path `DeckBreakdown.spec.tsx`, which this restack
  replaces (see the consent merge below).

## Conflict resolutions (lower PR's fix wins, both behaviours kept)

### Row 1 (25a over 09/18/23d/16/17/26–28)

- **Chat inputs (25a × 28 × 26).** The mention completer wraps the inputs, and they keep 28's
  translated placeholder and `aria-label` and 26's `border-control`. 25a's later
  `fix(chat): drop the private-chat completer …` no longer adds its own `inputLabel` keys:
  28's `RoomChat.input` / `PrivateChat.input` labels already name the inputs, so the commit now
  only drops the private completer and translates the game input's label (`ChatLog.inputLabel`);
  its subject says so. The chat specs from the completer commit up to that one expect a
  `combobox`.
- **Deck tabs (`c1ab7e8` × 09's split deck editor × 17a's draft tab).** Ported, not replayed:
  - `useDeckAutosave` gains `isModified`, `saveNow()` (resolves when the in-flight saves are
    answered: `DECK_UPDATED` → true, `DECK_UPDATE_FAILED`/`DECK_UPLOAD_FAILED` → false) and
    `discardChanges()` (cancels the debounce, drops the cache entry); `useDeckEditor` passes them
    on. 25a's `useDeckEditor.failures.spec` cases move to `useDeckAutosave.spec`.
  - `OpenDeckButton` moves to `components/editor/` (named export, like its siblings) and reads
    `flattenFolder` from `deckTree`; 25a's `deckStorage.ts` copy is dropped.
  - `DeckSidebar` takes an `openDeck` slot under Export. The editor offers it for stored decks only
    (an unsaved draft has no deck id to replace); `isBlank` uses `isBlankDeck` (desktop
    `isBlankNewDeck`) rather than "no cards".
  - TopBar: one tab per deck plus `DeckRouteState.replacesDeckId`; 17a's draft tab is additive like
    any other. The TopBar deck-tab specs find tabs by their route (27 made the tabs links named by
    28's `TopBar.tab.deck`).
- **Commander Spellbook consent (`a91c8c4` × 18's `bracketConsent`).** 18 already kept the bracket
  estimate off third parties until the user allows it, and left `bracketConsent` as the seam for
  the settings framework. The two now meet there:
  - 25a's setting (`commanderSpellbookIntegration`: Unprompted / Disabled / Enabled / Automatic) is
    the store; `useBracketLookupsMode` / `writeBracketLookupsMode` are the only reader and writer.
  - 18's inline prompt stays, with desktop's three answers (Enable / Automatic / Disable) instead of
    "Allow online lookups"; Enabled adds an "Estimate bracket" button for the deck as it is;
    Disabled leaves the section out of `DeckBreakdown`; "Turn off online lookups" goes back to
    asking.
  - 25a's modal `CommanderSpellbookConsent` and its old-path `DeckBreakdown` gating and spec are
    not carried. The integration spec writes the mode instead of the localStorage flag.

### Row 2 (R1 over f17)

- `Game.tsx`: R1's re-indented provider tree keeps f17's `data-game-board`.
- `usePlayerSeat`: `EMPTY_CARD_KEYS` comes from `GameSelectionContext` (f17); R1 keeps its own
  `NO_CARD_IDS`. No other textual conflict; the hand and stack plays all go through R1's
  `playCardMove` / `playedCardFields`.

### Row 3 (25b over 17a/17b/26–28/25a/R1)

- **One number control.** 25a's `NumberControl` (`unitKey`) wins; 25b's `suffixKey` rows use
  `unitKey`, its duplicate CSS goes, `NumberControl` commits through 25b's `clampWhole`, and 25b's
  coupled spin boxes (`pushes`) are added to it.
- **Board layout.** `useGameBoardLayout(game, rotation, minPlayersForMultiColumn)`: 17b's view
  rotation and 25b's minimum-player preference both apply.
- **Click to play (25b × R1).** `useSeatClickToPlay` plays hand and stack cards through R1's
  `playCardMove`, so a click-to-play carries the printed P/T and cipt like every other play. Its
  battlefield click keeps desktop's `TableZone::toggleTapped` (tap all unless all are tapped, send
  only changes), which differs from the card menu's Tap / Untap that R1's `toggleTapped` op
  implements. HandZone keeps R1/17a's arrow hit-testing attributes and menu on 25b's
  `renderOwnCard`.
- **Arrow lifetime (25b × R1).** `deleteInPhase` is added in R1's single `createArrow` port, so every
  arrow carries it; R1's characterization and target-command specs expect it.
- **Selection count (25b × 17a).** 17a's `TallyOverlay` already showed the total selection count.
  25b's `TotalSelectionCount` is dropped and its "Show total selection count" preference gates
  17a's count. `fd36e74` (announce that count from a live region) is dropped: 17a's review decided
  the count stays silent and only the tally is announced.
- **Annotate tokens** also applies to 17a's hand-card token items.
- **Focus and motion.** `keepFocusOnBoardPress` runs in front of R1's board mouse-down; 25b's
  `BoardMotionConfig` wraps the provider tree (re-indented).
- **HandZone.spec** uses the mocked `usePreferences` for 25b's layout cases (f17's file mocks
  `useSettings`).

### Row 4 (R2 over 17a/R1/28)

- 17a's read-only reveal menu (Hide, Clone, Select All, View related cards), its window-local hide
  and selection, and its keyboard select move into R2's `IncomingRevealPanel`. `ZoneCardCell`
  gains `cardOwner` (R1's `data-card-owner` / `data-card-zone`, so arrows still land on zone-view
  cards) and `interaction` (the reveal's role, keys and menu).
- R2's test i18n now formats with ICU; 28's ReportQueue spec bundle uses `{status}` instead of
  i18next's `{{status}}` from that commit on. f17's zone-view Tab spec names the view by its key.

### Row 5 (R6 over 17b)

- 17b's reverse-turn actor fix moves into `game.listeners.phases.ts`; the characterization stream
  sends the actor (`playerId: 2`) from its first commit so the recording stays the same.
- f25b's replay time base (`game.reducer.primitives`) is untouched by the split.

### Row 6 (R4 over 25b/R2/R6)

- The `cardCatalog.ts` split carries 25b's `cipt`, `landscape` and per-face `text` into
  `catalog/types.ts`, `lookup.ts`, `dexieCardMapper.ts` and `scryfallCardMapper.ts`; specs from the
  game chain mock `services/cards/catalog/lookup`.
- `formatLeaveMessage` moves to `messageLog` in R6's `game.listeners.players.ts`.
- D13's `SELECTED_CARD_GLOW` is not added: 25b's `SELECTED_RING` token already folds that ring.
- HandZone/StackColumn keep 25b's `useSeatClickToPlay`; R4's inline `lookupCard` edits are not
  carried (none survived the replay).
- R4's `BattlefieldSidebar.spec` (from `test(cards): pin each image call site's URL …`) stubs 17b's
  `GameMenu`, which needs a WebClient.

## Testing

Run on the R4 tip `30fbee1` (`/tmp/wt`), Vitest capped at 2 workers:

- `npx turbo run typecheck --concurrency=1`: 5/5. **Per commit:** every commit from 16 (`a472e86`)
  to the R4 tip typechecks (`turbo run typecheck` at each commit; 230 commits, 0 red after the
  17b fix).
- `npm run lint`: 3/3, 0 errors, 0 warnings. `npm run i18n:check -w @cockatrice/webatrice`: 107
  catalogues, 774 sources, all keys resolve. `src/i18n-default.json` matches `npm run translate`.
- Unit (`vitest run --maxWorkers=2`, webatrice in 4 shards because one run of the whole suite was
  OOM-killed on this 16 GB VM): webatrice **4359 passed** (1128 + 1092 + 1139 + 1000),
  sockatrice **900 passed**, datatrice **1430 passed**.
- Integration (`npm run test:integration -- -- --maxWorkers=2`): sockatrice **175**, datatrice
  **145**, webatrice **272** passed.
- `npm run test:e2e -w @cockatrice/sockatrice`: 4 files, **5 passed**.
- `test:e2e` webatrice (3.0.0 Servatrice image; chromium + firefox + webkit in the
  `playwright:v1.60.0-noble` container): **93 passed, 12 skipped, 0 failed**.
  - The full run reported 87 passed, 6 failed. `startup-tab.spec.ts` (25a, ×3 browsers) still
    opened Settings and Sign out by `button`; 26 made the user menu a `Menu`, so both are
    `menuitem` now, fixed in every commit that carries the spec; 3/3 pass after.
    `staff-tools.spec.ts` "an admin publishes a new server message" (×3) failed with
    `spawnSync docker ENOENT`: it seeds MySQL through `docker compose exec`, and the container had
    no docker CLI. With the docker socket, CLI and compose plugin mounted it passes 6/6 (the
    spec's other test included). Environment only.

## Notes for reviewers

- Every commit from 16 to the R4 tip typechecks (`turbo run typecheck`, per commit).
- 25a's `startup-tab` e2e selectors, the 25a chat specs and TopBar deck-tab specs, 17b's `useMessageMacros` deletion and R2's
  ReportQueue spec were fixed in the commits that broke them, and everything above was rebuilt with
  the same trees (`git commit-tree`), so no later commit changed.
- `bracketConsent` changed meaning: the localStorage flag `decks:bracketOnlineLookups` (18) is no
  longer read. 18 and 25a ship together in this series, so no stored value needs migrating; if 18
  merges upstream long before 25a, a one-line read of the old flag as Automatic would carry it.
