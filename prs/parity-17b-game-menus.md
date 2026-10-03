# feat(game): card and player menus: related cards, reveal to, hide, tally, custom zones, deck in editor, Say

## Summary
Part B of the game-actions PR (spec `specs/w17.md` §4–§10, commits 7–13). Part A (w17a: game menu, next phase with action, reverse turn, rotation, the reveal-to-all wire fix) runs in parallel and touches none of these files.

- **Commit 0: the player menus become data.** The library, hand, counters, own-battlefield and opponent-battlefield menu arrays move unchanged from `PlayerBox` into pure builders in `components/context-menus/PlayerContextMenu/playerMenu.model.ts`. PlayerBox splices each builder's output in with one call, so refactor stage 5 moves one call per region instead of the item lists. A new model spec pins every tree, hint and disabled state. The characterization and `Game.*` specs pass unchanged. Every later menu change lands in a model file, not in PlayerBox JSX (§14).
- **View related cards (§9).** Desktop `addRelatedCardView`: on every card menu (battlefield, stack, graveyard/exile view, hand, library/sideboard view, revealed card), a "View related cards" submenu lists each related and reverse-related card. It appears once one relation resolves in the card catalog. An item shows the card in the card-info pane. The preview store gains `showCardInfo` as the single owner of these requests, and `BattlefieldSidebar` pushes each request onto its related-card stack, so the next hover resets it. The dead opponent-card placeholder is gone. Both pins of the placeholder are updated on purpose.
- **Reveal to… (§7).** Hand cards and library/sideboard view cards get desktop's hand-or-custom-zone card menu (`handCardMenu.model.ts`): Play, Play Face Down, Reveal to… (All players, a separator, then each other player), Clone, Move to (desktop MoveMenu), Draw arrow (hand only), Select All, Select Column (views only), View related cards, and token actions (hand only). The read-only branch applies without write access. The menu sends one `Command_RevealCards` with every selected id, and "All players" omits `player_id`. `SeatCardMenuState` gains `hand` and `zoneView` kinds, `RevealSelection` gains `{ cardIds }`, and a new shortcut `game.revealSelectedToAll` (desktop `Player/aRevealToAll`) is unbound by default. "Reveal hand to…" and "Reveal random card to…" now always list "All players", as desktop does.
- **Hide (§8).** A read-only reveal window gets desktop's revealed-card menu: Hide, Clone, Select All, View related cards. Hide is window-local and sends nothing. It never touches the shared `revealedCards` snapshot, and a new reveal clears it. Shortcut `game.hideRevealedCard` = Alt+H. Click selects a card; Ctrl/Cmd+click toggles it.
- **Open deck in deck editor (§4, GAME-021).** This opens the deck being played as an unsaved draft, as desktop does. There is no name lookup among stored decks: `services/decks/deckHandoff` stages the `.cod` behind a one-read token, the new route `/deck/draft/:token` opens `DeckEditor` on it, and the draft's first save uploads it as a new deck (`deckUpload('', 0, xml)`). The editor then moves to that deck. File and clipboard decks open, duplicate names cannot pick the wrong deck, and printing fields survive.
- **Tally (§6, GAME-027).** Every player's menu has Tally (None / Subtypes / Total Power / Total Toughness). An overlay at the bottom right of the board shows the tally of the selection across every seat and zone. This ports Cockatrice 3.1's `Tally::compute` and is client-only. A separate commit adds desktop's selection count under it (from two selected cards).
- **Custom zones (§5, GAME-023).** The new `isBuiltinZone` (sockatrice) and a widened `ZoneEntry.name` (datatrice) feed `customZones` into the seat model. The own battlefield menu gets "Custom Zones" → "View custom zone '<name>'" after Sideboard, hidden while empty. The item opens the existing `ZoneViewDialog`.
- **Say (§10).** The own battlefield menu ends with Say: the message macros, disabled while there are none, each sent verbatim as `Command_GameSay`. Shortcuts `game.sayMacro1–10` default to Alt+1…Alt+0, because browsers keep Ctrl+digit for tabs. The e2e run confirms Alt+1 reaches the page on chromium, firefox and webkit.

## Parity rows closed
- **GAME-021** Open current game deck in editor: closed.
- **GAME-027** Tally: closed. Subtypes, Total Power and Total Toughness match 3.1 master, plus the selection count.
- **GAME-023** Custom zones: menu and view done. Moving cards out of a custom-zone view and dumping a hidden custom zone are follow-ups. No stock server emits custom zones.
- game-gaps "extra gaps": Reveal to…, Hide, View related cards and the Say menu (its editor is LONG-011, branch 19).

## Desktop reference
Cockatrice `add65caa`:
- `card_menu.cpp:132-151` (revealed branch), `:296-342` (hand / custom zone), `:360-406` (players menu, related view)
- `player_actions.cpp:51-98` (playCard), `:1214-1220` (say), `:1658-1685` (hide, reveal)
- `move_menu.cpp`, `hand_menu.cpp:165-200`, `player_menu.cpp:14-58`, `library_menu.cpp:48,203-205`
- `tab_supervisor.cpp:989-999`
- `tally_menu.cpp`, `game_graphics/tally/*`, `game_view.cpp:206-320`
- `custom_zone_menu.cpp`, `player_logic.cpp:98-170`
- `say_menu.cpp`
- `shortcuts_settings.h:503-505,560-562`

## Testing
Tip `93e07b4`, from the repo root:
- `npx turbo run typecheck --concurrency=1`: 5/5 tasks pass.
- `npm run lint`: 3/3 tasks pass.
- `npm test -- -- --maxWorkers=2`: sockatrice 776/776, datatrice 1196/1196, webatrice 2042/2042.
- `npm run test:integration -- -- --maxWorkers=2`: sockatrice 166/166, datatrice 136/136, webatrice 162 passed and 2 skipped (both skips were already on the base).
- `npm run test:e2e -w @cockatrice/webatrice`: built on the host, run in `mcr.microsoft.com/playwright:v1.60.0-noble` against Servatrice 3.0.0 on chromium, firefox and webkit. 42 passed, 3 failed. All three failures are `staff-tools.spec.ts:38` (an admin publishes a server message), which fails with `spawnSync docker ENOENT`: the spec shells out to `docker compose exec` for SQL, and the Playwright container has no docker CLI. This is environmental and unrelated to this PR; that spec also needs a 3.1 server. The new `card-menus.spec` passed 9/9 (3 tests × 3 browsers).
- Sockatrice e2e: not run. Sockatrice only gains the pure `isBuiltinZone` helper (with its unit spec); no server flow changed.
- New specs:
  - unit: `playerMenu.model.spec`, `handCardMenu.model.spec`, `revealedCardMenu.model.spec`, `tally.spec`, `useSelectionTally.spec`, `TallyOverlay.spec`, `useMessageMacros.spec`, `deckHandoff.spec`, `zoneNames.spec`, plus additions to `relatedCardActions`, `cardContextMenu.model`, `CardPreviewContext`, `IncomingRevealDialog`, `useDeckEditor`, `usePlayerZoneCommands`, `GameBoardCell`, `usePlayerSeatViewModel`, `useZoneViewDialog`, `Game.cardMenus`, `Game.zoneViews`, `Game.preview` and `Game.shortcuts`;
  - integration: `deck-draft.spec`, `game/custom-zones.spec`;
  - e2e: `card-menus.spec`, with 3 tests × 3 browsers.

## Notes for reviewers
- **Settings seam (branch 19).** `useMessageMacros` (`features/game/hooks/useMessageMacros.ts`) reads `webatrice.messageMacros` from localStorage and has no editor. `useTallyType` uses the `usePhaseTrackPinned` singleton pattern. At the final restack, swap both for branch 19's `useMessageMacros()` / `usePreference('tallyType')`; each file says so.
- **Divergences.**
  - Say defaults are Alt+digit, not desktop's fixed Ctrl+digit, and they can be rebound.
  - The selection count is always on; desktop has a setting for it.
  - Tally counts a face-up card's printed P/T when it has no live P/T, because web clients play cards without sending one.
  - The revealed-card menu leaves out Select Column; the web window has no columns.
  - Attach from the hand card menu is not wired yet.
  - A lent (writeable) reveal keeps its drag behaviour and gets no menu yet.
  - The game-level "Open deck in deck editor" is local-seat only. Desktop also offers it to a judge on another seat.
- **Not done here (w17a / spec §0.4):** the legacy reveal-to-all `playerId: -1` wire test and fix in `RevealCardsDialog` / `ZoneContextMenu` belong to w17a's commit 3. The seat path used by this PR already omits `player_id`.
- **PlayerBox still holds** the inline library pile menu, a near-duplicate of `libraryMenuItems` with small differences (it lacks some shortcut hints, and its grave index differs). It is left unchanged so commit 0 stays a pure move. Deduplicate it in Phase 7.
- **Changesets:** webatrice minor, sockatrice minor (`isBuiltinZone`), datatrice patch (`ZoneEntry.name`).
