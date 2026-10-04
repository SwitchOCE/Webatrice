# feat(game): game menu with reverse turn, next phase with action and view rotation, plus three pinned fixes

## Summary

Part A of PR 17 (spec `specs/w17.md` §0–3, §12). Six commits plus a changeset, then four review-fix commits (8–11), oldest first. Each commit typechecks on its own.

1. `fix(game): offer Transform into on card id 0`. `buildTransformItems` treated a falsy id as "no server id". Servatrice numbers cards from 0, so the first card of every game had no Transform item. The guard is now `sourceCardId == null`, and the pinned spec row is flipped.
2. `fix(game): sort non-creatures by name under the P/T zone sort`. `Infinity − Infinity` is NaN, so two non-creatures never fell through to the name tie-break. Equal keys now compare as 0, and ties break by name and then set.
3. `fix(game): omit player_id when revealing to all players`. This was confirmed on the wire. protobuf-es serialises an explicitly set `-1` for the proto2 `optional sint32 player_id [default = -1]`, and Servatrice answers any present `player_id` naming no player with `RespNameNotFound`. Every legacy "to all players" reveal was affected: the hand, zone and library reveal dialogs, plus "Reveal top card to all". They now go through one `revealRecipient` helper. The seat port was already correct.
4. `fix(sockatrice,datatrice): carry the actor on Event_ReverseTurn`. `turnReversed(gameId, reversed, playerId?)` gains an additive optional argument. The log line now names whoever reversed the order, not the active player. Patch changesets are included. (Commit 8 drops the original fallback to the active player when the actor is missing.)
5. `feat(game): add a game menu with reverse turn and next phase with action` (GAME-028, GAME-029).
   - A "Game" button sits in the BattlefieldSidebar header, next to Leave. It is a MUI Menu in `TabGame::createMenuItems` order.
   - The items come from a pure model, `gameMenu.model.ts`, and are disabled where the server would refuse them.
   - `phaseActions.ts` is a pure port of `actNextPhaseAction` / `triggerPhaseAction`. `useNextPhaseAction` runs it through the phase bar's handlers.
   - The `game.nextPhase` / `game.prevPhase` shortcuts now use the phase bar's handler instead of a duplicate optimistic update.
6. `feat(game): rotate the board view clockwise and counterclockwise` (GAME-030).
   - `useGameBoardLayout(game, rotation)` mirrors `GameScene::rotatePlayers`.
   - The rotation is per-game state in `useGame`, never persisted.
   - Menu items and unbound shortcuts are added, and spectators can use them.
   - The arrow overlay now re-measures after a layout commit, because a rotation moves seats without resizing the board or touching the card registry.
7. `chore(changeset)`: a webatrice minor.
8. `fix(datatrice): log no reverse-turn line when the actor is unknown`. Like desktop's `eventReverseTurn`, no line is logged when the actor is absent, `-1` or not a seated player. Before this, those cases fell back to the active player, which brought the misattribution back.
9. `fix(game): gate the next-phase-action wrap on passing the turn, and send it once`. At End the action is now gated on `canPassTurn` alone, as spec §1 says, so an off-turn player can wrap as on desktop. The untap goes through the same gate via `usePhaseBar.handlePassAndUntap`. A per-game pending wrap, shared by the menu and the shortcut, drops a second press until the server changes the active player or phase.
10. `refactor(game): one owner for reverse turn and the all-players sentinel`. `usePhaseBar.handleReverseTurn` is used by both the menu and the shortcut. `ALL_PLAYERS` is imported from `revealRecipient.ts` in `RevealCardsDialog` and `usePlayerBoxProps`.
11. `test(shortcuts)`: pins Shift+Tab on `game.nextPhaseAction` only, with `game.prevPhase` unbound.

## Parity rows closed

- GAME-028 Next phase with action
- GAME-029 Reverse turn order
- GAME-030 Rotate view CW/CCW

## Desktop reference

- `tab_game.cpp:665-707` (actNextPhase, actNextPhaseAction, actRotateViewCW/CCW) and `:1042-1119` (menu order)
- `phases_toolbar.cpp:245-250`
- `game_scene.cpp:246-361` (adjustPlayerRotation, rotatePlayers, row mirroring)
- `server_game.cpp:690-711` (game starts in Untap)
- `server_abstract_player.cpp` cmdRevealCards (`has_player_id()`)
- `card_list.cpp:42-62` (P/T string sort)
- `message_log_widget.cpp:577-582`
- `game_event_handler.cpp:504-513` (eventReverseTurn logs nothing for an unknown player)
- `server_player.cpp:544-556` (cmdNextTurn has no active-player check)

## Testing

All on the final tip:
- `npx turbo run typecheck`: 5/5 tasks pass. `npm run lint`: 3/3 pass.
- Unit tests:
  - sockatrice: 775/775
  - datatrice: 1200/1200 across 29 files
  - webatrice: 2084/2084 across 251 files
- Integration tests:
  - sockatrice: 166/166
  - datatrice: 137/137
  - webatrice: 163 passed, 2 skipped. The skips are pre-existing placeholder files.
- New specs:
  - `phaseActions.spec`: the full 0..10 table.
  - `useNextPhaseAction.spec`: wire order and gating, the off-turn wrap, and the wrap double press.
  - `usePhaseBar.spec`: `handlePassAndUntap` and `handleReverseTurn`.
  - `defaults.spec`: the Shift+Tab / prevPhase defaults.
  - `GameMenu.spec` / `gameMenu.model.spec`.
  - `useGameBoardLayout`: the n=2..6 × rotation −2..+2 table for a seated player and a spectator, checked against a literal port of `rotatePlayers`.
  - `Game.rotateView.spec`: seats move and no request is sent.
  - `revealRecipient.spec`.
  - Integration `reveal-wire.spec`: checks the encoded bytes.
  - Integration `websocket/game.spec`: the reverse-turn log line names the actor. Datatrice `gameResponseToStore.spec`: no actor means no log line.
  - Overlay re-measure, and datatrice listener log lines.
- e2e was not re-run for the review fixes (8–11). They change gating and de-duplicate code, not the server flow the e2e drives. Results from the original tip: new two-client `game-menu.spec.ts`. The player off turn reverses the order and both logs name them. The active player then steps Untap → Upkeep → Draw, and both clients see the library drop by one. It passes on chromium, firefox and webkit (Playwright 1.60 container against Servatrice 3.0.0). Full webatrice e2e suite: 39/39 (13 specs × 3 browsers). In the first pass, 36 passed and `staff-tools` failed 3/3 with `spawnSync docker ENOENT`: the Playwright container has no docker CLI, and that spec seeds MySQL through `docker compose exec`. Re-run with the host docker CLI and socket mounted, it passed 6/6. Sockatrice e2e: 5/5.

## Notes for reviewers

- **Deliberate divergences:**
  - Next phase with action is gated on `canAdvancePhase` for a phase step and on `canPassTurn` alone for the wrap from End (spec §1). Desktop does not gate it; there the server rejects the phase change while the draw still lands. A second wrap press is ignored until the server answers. If the server rejects NextTurn, the guard holds until the active player or phase next changes.
  - Game menu items are disabled where the server would refuse them; desktop leaves them enabled.
  - P/T sort stays numeric with non-creatures last (Q4 accepted). Desktop's zero-padded string order puts "2/10" after "3/3".
- **Shortcuts:**
  - `game.nextPhaseAction` takes desktop's Shift+Tab, so the Webatrice-only `game.prevPhase` is now unbound (still rebindable). The changeset says so.
  - `game.reverseTurn`, `game.rotateViewCW` and `game.rotateViewCCW` are listed unbound, like desktop. Reverse turn is a small extension: desktop never registers its shortcut.
- **Placement:** the Game button sits in the Players header rather than the Concede row, because that row is hidden for spectators and rotation is open to them.
- **Rotation wiring:** `onRotateView` rides on `GameDialogActions`, which is already the sidebar's action context. That avoided a new provider, which would have meant re-indenting about 140 lines of `Game.tsx` and risked colliding with refactor stage 5.
- **Mirroring:** a rotated local seat away from the bottom row renders mirrored, because mirroring is by row (same as desktop). The e2e page object's "unmirrored = local" assumption only holds without rotation.
- **Refactor stage 5:** no PlayerBox JSX was touched. `Game.tsx` changes are one prop each (`layoutVersion`, `onRotateView`).
- **Follow-ups (out of scope):**
  - A single click on the active Untap button always untaps (`PhaseTrack.tsx`); desktop only does this on an already-active button.
  - PhaseTrack labels and BattlefieldSidebar strings are hard-coded English.
  - The P/T sort has no printing id in `ZoneViewCardMetadata`, so set is the last tie-break.

## Review response (rv9)

- Wrap gate deviated from spec §1 → fixed (commit 9). An off-turn wrap now runs, and the untap shares the pass's gate.
- Wrap double press sent NextTurn twice → fixed (commit 9). The pending wrap is per store and game and is cleared on the next active-player or phase change.
- Reverse-turn fallback to the active player → fixed (commit 8). Desktop parity: no line is logged. The `it.each([undefined,-1])` row is flipped, and an unknown id (9) is added. The datatrice integration case now passes the actor, and a no-actor case is added.
- Reverse-turn gate+send duplicated → `usePhaseBar.handleReverseTurn` (commit 10).
- `ALL_PLAYERS` sentinel duplicated → imported in both places (commit 10).
- Shift+Tab / prevPhase defaults not pinned → `defaults.spec.ts` (commit 11).
- Not taken in this pass, per the task scope (the minors listed above): the Game-menu overclaim (Phases submenu and "Remove all local arrows"), `layoutVersion` churn, the `reveal-wire` integration spec reaching into internals, and the nits. They stay open as follow-ups.

## Rebase onto stage 5 (w17r)

Branch `claude/restack-17a-game-actions`, tip `57a3449`, on `claude/restack-16-game-lobby` (refactor stage 5 below). 12 commits: the 11 above, rebased, plus one new commit.

- **Conflicts and where they went:**
  - Commit 3 (`omit player_id`): the instructions line kept; its `SideboardDialog` bullet dropped, because stage 5 deleted that dialog.
  - Commit 5 (game menu): the sidebar header now carries the invite controls (branch 16), then `GameMenu` and Leave. Leave keeps the replay "Close" label and title.
  - Commit 6 (rotation): `onRotateView` is in both branches of `Game.tsx`'s read-only / live `dialogActions`, so a replay can rotate too.
  - Commit 10 (`ALL_PLAYERS`): `usePlayerBoxProps.ts` no longer exists. Its "-1 = every player" mapping lives in stage 5's `ui/PlayerBoard/revealRecipient.ts` (`toRecipient`), which now compares against `ALL_PLAYERS`.
  - No PlayerBox file came back. 17a never touched PlayerBox JSX.
- **New commit 12, `fix(shortcuts): leave Tab to focus navigation inside dialogs, menus and controls`** (audit G1, `specs/aud.md` §1.2):
  - `feature-widgets/shortcuts/focusGuards.ts`: Tab / Shift+Tab without Ctrl, Alt or Meta are ignored when focus is inside `[role=dialog]`, `[role=alertdialog]`, `[role=menu]` or `[aria-modal=true]`, or on a form control, button, link or button-like role. They keep desktop's bindings on the body and the board. This is a sanctioned accessibility divergence (instructions, divergence protocol item 3).
  - Provider-level modal guard: while an `aria-modal="true"` element is mounted, only GLOBAL registrations fire. Route shortcuts stand down, so Escape reaches the modal and does not close the latest zone view.
  - Shift+Tab → Next phase with action was already done by commit 11. The new `ShortcutProvider.spec` pins it through the real listener.
  - Specs: `focusGuards.spec` (14 tests) and `ShortcutProvider.spec` (8 tests). 4 of the provider tests fail without the guard.
  - The `webatrice.instructions.md` architecture list gains a "Shortcut focus guards" bullet. New patch changeset `game-shortcut-focus.md`.
- **Testing at `57a3449`:**
  - `turbo typecheck` passes at every one of the 12 commits.
  - Unit: sockatrice 42 files / 895 tests, datatrice 35 / 1316, webatrice 449 / 3554. All pass.
  - Lint 3/3.
- The webatrice e2e for 17a's flows (`game-menu.spec`) ran in the full suite at the 17b tip; see the 17b note.
