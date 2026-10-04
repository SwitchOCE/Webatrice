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
- **Lint.** A `no-restricted-imports` block in `packages/webatrice/eslint.config.mjs` rejects `useWebClient` (and the `WebClient` value import) under `features/game/components/**` and `features/game/hooks/**`. The exceptions are the port modules in `components/ui/GameBoardCell/**` and 13 files that predate the rule, listed by name so the list only shrinks.
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
- A hand card's "Draw arrow..." sent `createArrow` with `startZone: hand` and no play. It now plays the card first and draws from where it lands, like the right-button drag and desktop `ArrowDragItem::mouseReleaseEvent` (arrow_item.cpp:434-446). The audit names this as the "play then arrow written twice / menu uses one path, drag the other" duplicate.

M1 fixes (commit 6):

- A play through `playCardViaTableRow` or `autoPlayCard` now lands with its printed P/T, and tapped when cipt.
- A hand, stack, graveyard or exile drag onto the battlefield now lands with its printed P/T.

Consequences of having one pending owner. These are rule merges, not new features:

- Only one pick can be pending in the game; before, each seat could hold its own.
- While a pick is pending, a left press on the board no longer starts a box selection (`pendingActive` now sees seat picks).
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

Run from the repo root on the branch tip:

- `npx turbo run typecheck --concurrency=1`: 5/5 tasks green. Each of the 7 commits also typechecks on its own (`tsc --noEmit` per commit).
- `npm run lint`: 3/3 green.
- `npm test -- -- --maxWorkers=2`:
  - sockatrice 896/896 (43 files);
  - datatrice 1316/1316 (35 files);
  - webatrice 3822/3822 (467 files).
- `npm run test:integration -- -- --maxWorkers=2`:
  - sockatrice 175/175;
  - datatrice 145/145;
  - webatrice 270/271. The one failure is `integration/src/features/game/invite-link.spec.tsx` › "a link clicked in a room's chat opens the game with one navigation" (no `back` button). It fails identically on the base `41f0d47` (checked in a base worktree), so it is pre-existing and unrelated.
- `npm run test:e2e -w @cockatrice/webatrice` (chromium + firefox + webkit, run in the pre-pulled `mcr.microsoft.com/playwright:v1.60.0-noble` image against the 3.0.0 Servatrice): 75 passed, 12 skipped, 3 failed. All 3 failures are `staff-tools.spec.ts:38` "an admin publishes a new server message from Administration", one per browser, with `spawnSync docker ENOENT`: the spec shells out to `docker` and the Playwright container has no Docker CLI. The host's own Chromium is the wrong build, so the spec could not run on the host either. This is an environment limit, and the Administration flow is untouched by this PR. All game, arrow and menu e2e specs passed on all three browsers.
- New and updated specs:
  - `battlefieldSelectionOps.spec` (24), `useBattlefieldCardOps.spec` (10);
  - `cardContextMenu.model.spec` (+3 for `buildOpponentCardMenu`);
  - `useSeatShortcutOperations.spec` (11, now over the real ops);
  - `arrowResolution.spec` (15), `useArrowDrag.spec` (5), `usePendingTarget.spec` (8);
  - `usePlayerTargetCommands.spec` (6: judge wrap, colour, zone, play then arrow; the deleteArrow game id is now asserted), `useCardPlayCommands.spec` (3);
  - `useSeatDnd.spec`, `seatDropPlan.spec`, `playCard.spec` (+2), `cardPlacement.spec` (+5).

## Notes for reviewers

- `Game.tsx` shows a large diff only because one provider wraps the subtree: `git diff -w` shows +3 lines. Likewise `renderWithProviders.tsx`, which now provides a real pending-target owner so seats rendered without `<Game />` keep working.
- The game-level `handleCardClick`, `handleCardDoubleClick`, `handlePlayerClick` and stack A's `startPendingArrow` / `startPendingAttach` are reachable only through `GameInteractionContext` and stack A's `CardContextMenu`. Nothing consumes the first today (no `useGameInteraction` caller), and the second opens only from it. They are kept and moved onto the ports rather than deleted, since PR 30 owns stack A.
- `usePlayerTargetCommands` reads `invertVerticalCoordinate` through `getSettings()` at call time, so the port does not subscribe every render to the settings store.
- `useSeatDnd` lost its unused `playerId` arg.
- Attach picks still resolve only on the source seat's own battlefield (a seat-side check in `usePlayerSeat.resolveAttachPress`), which preserves today's behaviour. Desktop allows any table card; `planAttach` already supports it.

Follow-ups:

- **Cross-seat attach:** drop the seat-side check once wanted.
- **Stack-card attach:** "Attach to card..." from a stack card still sends `startZone: TABLE`, as before. Desktop `attachCards` plays the card to the table first.
- **Zone-view dialog drags:** drags out of `ZoneViewDialog` / `IncomingRevealDialog` onto the battlefield do not yet carry `printedPT`. That needs the dialogs' card metadata; R2 territory.
- **Table-row policies:** the card-database tablerow policy and the legacy type-line policy are both still live, per refactor plan §10, and M1 does not choose between them.
- **Rule allowlist:** each file listed in the new lint rule should move behind a port. Stack A's three hooks leave with PR 30.
