# refactor(game): one card-ops and targeting seam

## Summary

Implements aud2 §4 R1 in full, with duplicates D1 (card operations, three copies) and D2 (arrow/attach sending and pending state). It also carries orchestrator item M1 (rv16): every play and battlefield drop carries the printed P/T.

- **Card ops (D1).** `ui/PlayerBoard/battlefieldSelectionOps.ts` is pure, with table specs. It holds desktop's cardMenuAction target rule (`resolveTargets`, `selectionOrAll`) and the per-card maths: `ptDeltaEntries`, `resetPTEntries`, `counterStepEntries`, `incrementAllCounterEntries`, `totalPower`, `cloneSource`, `sameSlotIds`.
  - `ui/PlayerBoard/useBattlefieldCardOps.ts` binds these to the seat ports as one `BattlefieldCardOps` per target set (`forCard(id)` for a menu, `forSelection()` for a shortcut).
  - `BattlefieldCardMenu` only maps ops onto the model: 704 → 123 lines.
  - `buildOpponentCardMenu` joins `buildCardContextMenu` in `cardContextMenu.model.ts`.
- **Shortcut table.** `useSeatShortcutOperations` is now one `Record<SeatShortcutActionId, (seat) => void>`: each of the 46 action ids calls an existing seat op, prompt or port.
  - It takes the seat as one `SeatShortcutSeat` object instead of 28 positional args: 697 → 158 lines.
  - The selection-scoped ids run the same `BattlefieldCardOps` as the menu.
- **Targeting seam (D2).**
  - `PlayerTargetCommands` gains:
    - judge wrapping: an attach or unattach runs as the card's owner. Arrows are never wrapped, because desktop `CardItem::drawArrow` draws as the active local player, and sockatrice's `createArrow` has no judge option for that reason.
    - an arrow colour;
    - the card target's `zone`;
    - `playAndCreateArrow`.
  - `useTargetCommandsFor(gameId)` serves the same commands for any player.
  - `hooks/arrowResolution.ts` is pure: `planArrow`, `planAttach`, `arrowColorForModifiers`, plus `sendArrowPlan`, which only calls the port it is given.
  - `hooks/useArrowDrag.ts` is the right-button drag: pointer and hit-testing only.
  - `hooks/usePendingTarget.ts` is the **one pending-target owner**. Game provides it to the seats through `PendingTargetContext`. `usePendingArrows` is folded in and deleted.
  - The double-click tap and play chain go through the new `GameBoardCell/useCardPlayCommands.ts` port.
  - `useGameArrowInteractions` now composes these (627 → 157 lines) and imports no WebClient.
- **Lint.** A `no-restricted-imports` block in `packages/webatrice/eslint.config.mjs` rejects `useWebClient`, `WebClientContext` and the `WebClient` value import under `features/game/components/**` and `features/game/hooks/**`. The exceptions are the port files, listed by name (`GameBoardCell/use*Commands.ts`, `useMoveCard.ts`, `useGameSay.ts`), and 13 files that predate the rule, also listed by name so the list only shrinks. The rule only sees imports: `hooks/dialogs/*` and `hooks/playCard.ts` still call `request.game.*` on an instance passed in by the allowlisted `useGameDialogs`, and the config comment names that debt.
- **M1.** `playedCardFields` (in `cardPlacement.ts`) is the one rule for a played card's P/T and cipt-tapped state, following desktop `PlayerActions::playCard`.
  - `playCardMove` (menu, HandZone, StackColumn) and `playCardViaTableRow` / `autoPlayCard` (play then arrow, double-click) all use it.
  - A seat drag from any zone but the battlefield carries `printedPT`, which `planSeatMove` sends when the card enters the battlefield, as desktop `TableZone::handleDropEventByGrid` does. A drop never taps, matching desktop.

Commits (oldest first; each one typechecks, checked commit by commit):

1. `test(game): pin the seat card ops and both arrow paths on the wire`: `Game.cardOps.characterization.spec.tsx`, 96 tests through `<Game />` with the real ports, asserting on the wire:
   - every seat shortcut action id (46, plus a coverage check);
   - every own and opponent battlefield-menu action;
   - the menu and shortcut target pick: arrow to a card, to a stack card, to a player, from a hand card; the cancel paths; attach from the selection;
   - the right-button drag: colours by modifier, a stack target, a player target, an opponent source, cancel.
2. `refactor(game): run the battlefield card menu on shared card ops`
3. `refactor(game): make the seat shortcuts a table over the card ops`
4. `refactor(game): one targeting seam for arrows and attachments`
5. `chore(lint): keep the game's components and hooks off the WebClient`
6. `fix(game): every play and battlefield drop carries the printed P/T` (M1)
7. `chore(changeset): game card ops and targeting seam`: `@cockatrice/webatrice` patch.

### Behaviour changes (listed separately, as tasked)

Fixes, both recorded as changed expectations in the characterization spec in commit 4:

- A menu or shortcut arrow to a card on the stack (or any non-battlefield card) sent `targetZone: TABLE`; it now sends the card's own zone, as the right-button drag always did.
- A hand card's "Draw arrow..." sent `createArrow` with `startZone: hand` and no play. It now plays the card first and draws from where it lands, like desktop `ArrowDragItem::mouseReleaseEvent` (arrow_item.cpp:434-446). Desktop plays with `playCard(false)`, which honours "Play all nonlands onto the stack" (player_actions.cpp:72-80), so the play goes through `autoPlayCard` with the `playToStack` preference: by default a non-land lands on the stack. The right-button drag uses the same play (it used to send everything but instants to the battlefield). The audit names this as the "play then arrow written twice / menu uses one path, drag the other" duplicate.

M1 fixes (commit 6):

- A play through `playCardViaTableRow` or `autoPlayCard` now lands with its printed P/T, and tapped when cipt.
- A hand, stack, graveyard or exile drag onto the battlefield now lands with its printed P/T.

Consequences of having one pending owner. These are rule merges, not new features:

- Only one pick can be pending in the game; before, each seat could hold its own.
- While a pick is pending, the game-level box selection no longer starts (`pendingActive` now sees seat picks). No seat surface carries `[data-zone-box-select]`, so nothing in the live UI starts that box selection anyway: this is pinned only by `useGameBoxSelection.spec`, and the changeset no longer claims it.
- A real card drag (past the threshold) cancels a pending pick (`cancelPendingArrow` on drag start now reaches seat picks).
- Escape cancels a pick unless a MUI dialog is open. This was the game-level rule; the seat's picks had no dialog check.
- Same-card cancel now compares the zone too.
- Judge wrapping on the seat target port: a judge's attach/unattach of another player's card is wrapped as its owner. No live seat path reaches it today, since the own-card menu and shortcuts act only on the local seat.

## Parity rows closed

None directly: this is the aud2 R1 refactor. It removes D1 and D2 from aud2 §3 and the `useGameArrowInteractions` layering violation from §2. It is what 17c ("each ActionId calls an existing seat op" becomes a table entry), 30 G10 (one pending owner for the keyboard target picker) and 30 G4 (stack-A deletion needs judge wrapping in the ports) build on.

## Desktop reference

Cockatrice `add65ca`:

- `player_actions.cpp`:
  - `cardMenuAction` (1761-1808);
  - `actIncPT`, `actResetPT`, `actReduceLifeByPower` (1432-1455), `actUnattach` (1503-1517), `actIncrementAllCardCounters`;
  - `playCard` / `playCardToTable` (51-135);
  - `sendGameCommand` (2000-2011, the judge wrap).
- `arrow_item.cpp`:
  - `ArrowDragItem::mouseReleaseEvent` (392-460): colour, player vs card target, hand play then arrow;
  - `ArrowAttachItem::attachCards` (556-571).
- `card_item.cpp` `CardItem::drawArrow` (275-310): arrows owned by the active local player, never judge-wrapped.
- `table_zone.cpp` `handleDropEventByGrid` (180-206): a drop from another zone carries P/T and does not tap.
- `card_menu.cpp:183-194`: the opponent `!canModifyCard` menu.

## Testing

Run from the repo root on the tip `178bf75` (rv20 fixes on top of 2f6e5b6):

- `npx turbo run typecheck --concurrency=1`: 5/5 tasks green.
- `npm run lint`: 3/3 green.
- `npm test -- -- --maxWorkers=2`:
  - sockatrice 896/896 (43 files);
  - datatrice 1316/1316 (35 files);
  - webatrice 3842/3842 (470 files), run as `vitest run --maxWorkers=2 --shard=N/4` (118 + 118 + 117 + 117 files; 991 + 1044 + 950 + 857 tests). Unsharded, one vmThreads worker is OOM-killed by this container's memory cgroup (about 13.5 GB RSS). The base 2f6e5b6 is OOM-killed the same way, so this is an environment limit, not a regression.
- `npm run test:integration -- -- --maxWorkers=2`:
  - sockatrice 175/175;
  - datatrice 145/145;
  - webatrice 270/271. The one failure is the pre-existing `invite-link.spec.tsx` › "a link clicked in a room's chat opens the game with one navigation", which also fails on base 41f0d47 (see the previous run).
- `npm run test:e2e -w @cockatrice/webatrice` (chromium + firefox + webkit, in `mcr.microsoft.com/playwright:v1.60.0-noble` against the 3.0.0 Servatrice): 75 passed, 12 skipped, 3 failed. All 3 failures are `staff-tools.spec.ts:38`, one per browser, with `spawnSync docker ENOENT`: the spec shells out to `docker`, and the Playwright image has no Docker CLI. This is the same environment limit as the previous run. All game, arrow and menu specs pass on all three browsers.
- Every behaviour fix has a spec that fails before it, checked by swapping the fixed file back to the previous commit: the playToStack arrow; the render count; the attach anchor; untap (and the always-tap mutant); stack attach zone; the hand drag and zone-view pick; drag colour; prompt identity; the pending ref and missing port; the card-drag cancel (against a no-op cancel mutant).
- New specs: `pendingPointerStore.spec` (1), `PendingTargetArrows.spec` (2), `Game.pendingPointer.spec` (2). `Game.cardOps.characterization.spec` grows from 96 to 105. Also extended: `usePlayerTargetCommands.spec`, `usePendingTarget.spec`, `useBattlefieldCardOps.spec`, `useBattlefieldMenuItems.spec`, `useSeatPrompts.spec`, `useArrowDrag.spec`, `arrowResolution.spec` and `playCard.spec`.

## Notes for reviewers

- `Game.tsx` shows a large diff only because one provider wraps the subtree: `git diff -w` shows +3 lines. Likewise `renderWithProviders.tsx`, which now provides a real pending-target owner so seats rendered without `<Game />` keep working.
- The game-level `handleCardClick`, `handleCardDoubleClick` and stack A's `startPendingArrow` / `startPendingAttach` are reachable only through `GameInteractionContext` and stack A's `CardContextMenu`. Nothing consumes the first today (no `useGameInteraction` caller), and the second opens only from it. They are kept and moved onto the ports rather than deleted, since PR 30 owns stack A.
- `usePlayerTargetCommands` reads `invertVerticalCoordinate` and `playToStack` through `useSettings` / `usePreference`, like its sibling `useCardPlayCommands`.
- `useSeatDnd` lost its unused `playerId` arg.
- Attach picks still resolve only on the source seat's own battlefield (a seat-side check in `usePlayerSeat.resolveAttachPress`), which preserves today's behaviour. Desktop allows any table card; `planAttach` already supports it.

Follow-ups:

- **Cross-seat attach:** drop the seat-side check once wanted.
- **Stack-card attach (wire):** "Attach to card..." from a stack card still sends `startZone: TABLE`, as before. Desktop `attachCards` plays the card to the table first. The pick now keeps the stack zone, so its live arrow draws.
- **Printed P/T, two sources:** `playCardViaTableRow` reads the printed P/T from the CardDTO `pt` property, while the menu and drag paths read the seat catalog's `power` / `toughness`. `playedCardFields` is the one rule, but its input differs by path. This belongs with the table-row policy follow-up below.
- **Attach onto an attached card:** desktop `attachCards` also refuses a target that is itself attached. `ArrowTarget` doesn't carry attachment state, so that check is not ported.
- **Untap all:** `useGameShortcuts` (`game.untapAll`) and `usePhaseBar` still send `setCardAttr(cardId -1)` directly instead of going through the seat's `cardCommands.untapAll`. They are game-level and outside the battlefield card ops, but they belong on the port.
- **Zone-view dialog drags:** drags out of `ZoneViewDialog` / `IncomingRevealDialog` onto the battlefield do not yet carry `printedPT`. That needs the dialogs' card metadata; R2 territory.
- **Table-row policies:** the card-database tablerow policy and the legacy type-line policy are both still live, per refactor plan §10, and M1 does not choose between them.
- **Rule allowlist:** each file listed in the new lint rule should move behind a port. Stack A's three hooks leave with PR 30.

## Review response (rv20)

New commits on top of 2f6e5b6 (the task asked for no history rewrite):

- **Major: hand "Draw arrow..." ignored playToStack.** Fixed (`0b67c92`). The play goes through `autoPlayCard` with the preference. Specs cover playToStack on (stack) and off (table). The drag and pick specs that pinned TABLE now expect STACK.
- **Major: pointer in the shared context.** Fixed (`4c15d6f`). The pointer lives in `hooks/pendingPointerStore.ts`. `PendingTargetArrows` (extracted from PlayerBoard) is its only subscriber, through `useSyncExternalStore`. `Game.pendingPointer.spec` counts `usePlayerSeat` renders per seat and fails on the old code. The overlay now finds the source card in its own zone.
- **Major: attach shortcut anchor.** Fixed (`961165a`): a placeholder anchor hands the arrow to the first target with a server id. Spec added.
- **Major: fourth increment-all copy.** Fixed (`33774c3`): the background menu takes `cardOps.incrementAllCounters`. Grepping again found a fifth duplicate, the battlefield double-click Tap/Untap, which now calls `cardOps.forCard(id).toggleTapped()`. Untap-all in `useGameShortcuts` / `usePhaseBar` is game-level and listed as a follow-up.
- **Major: untap direction.** Fixed (`640a3e4`): tapped anchors in both specs. The always-tap mutant now fails 2 tests.
- **Minor: characterization gaps.** Fixed (`37308ee`): clone of the row-2 Wall, Turn Over from the face-down Morph, an own arrow and a B counter in the fixture, and a CardDTO `pt` asserted in `cardsToMove` (playToStack off). createAnotherToken stays `{}`: the fixture has no last token, and the shortcut table spec covers it.
- **Minor: hand / zone-view data attributes.** Fixed (`d2034ce`). Hand cells and ZoneViewPanel cards carry owner and zone. The ordered reveal panel stays unmarked because its ids are deck positions. Specs cover a right-drag from a hand card and a pick on a graveyard-view card.
- **Minor: commit hygiene (split the fixes out of 00445b5).** Not done: the task forbids history rewrites, because w17c builds on 2f6e5b6. This PR file lists the two fixes separately.
- **Minor: lint exceptions.** Fixed (`0486a81`).
- **Minor: stack startAttach zone.** Fixed (`67e6886`). The wire side stays a follow-up.
- **Minor: planAttach accepted any zone.** Fixed (`24786d5`), citing arrow_item.cpp:553-556.
- **Minor: drag colour.** Fixed (`dfd4dc6`): the colour is frozen when the threshold is crossed (card_item.cpp:332-347), for both preview and drop.
- **Minor: cardOps memo never hit.** Fixed (`51be3d6`): useCallback on the four openers, plus an identity spec.
- **Minor: untested Consequences.** Added (`fd8bf8b`): one pick per game, card drag cancels (verified against a no-op cancel mutant), and the same-card zone compare. The box-selection consequence has no live surface (above) and is not claimed in the changeset.
- **Minor: two P/T sources.** Dropped the split power/toughness fallback (`ee59720`) and noted the two sources under follow-ups.
- **Nits.** All applied (`f6ef503`, `3086532`): the ref is set in the setters and resolve returns false without a port (2 specs); `handlePlayerClick` deleted; `targets` removed and `PrintedPT` made private, with the doc reworded; `startTableArrow` renamed and the comment fixed; isSelf comment added; stale instructions and spec text updated; settings read one way.

API changes, for w17c: `PendingTargetPicker.pointer` is now a `PendingPointerStore`, read with `usePendingPointer`. The `usePlayerSeat` controller drops `pendingArrowPointer` and `drawArrowPending` and adds `seatPending`. The controller's `startAttach` gains an optional third `sourceZone` argument. `useBattlefieldMenuItems` takes `incrementAllCardCounters` in place of `selection`. `BattlefieldCardOps.targets` is removed. `useGameArrowInteractions` no longer returns `handlePlayerClick`.

## Restack notes (wR4a)

Branch `claude/restack-r1-card-ops-seam`, tip `331dfc9`, 24 commits on 25a, replayed from `41f0d47` onto f17's 17b line. Conflicts: `Game.tsx` keeps f17's `data-game-board` on R1's re-indented board; `usePlayerSeat` takes `EMPTY_CARD_KEYS` from `GameSelectionContext` (f17) and keeps `NO_CARD_IDS`. f17's play-path commits apply on top of R1's single `playCardMove` / `playedCardFields` helper with no duplicate path left.
