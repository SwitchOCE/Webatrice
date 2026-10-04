# feat(game): card and player menus: related cards, reveal to, hide, tally, custom zones, deck in editor, Say

## Summary
Part B of the game-actions PR (spec `specs/w17.md` §4–§10, commits 7–13). Part A (w17a: game menu, next phase with action, reverse turn, rotation, the reveal-to-all wire fix) runs in parallel and touches none of these files.

- **Commit 0: the player menus become data.** The library, hand, counters, own-battlefield and opponent-battlefield menu arrays move unchanged from `PlayerBox` into pure builders in `components/context-menus/PlayerContextMenu/playerMenu.model.ts`. PlayerBox splices each builder's output in with one call, so refactor stage 5 moves one call per region instead of the item lists. A new model spec pins every tree, hint and disabled state. The characterization and `Game.*` specs pass unchanged. Every later menu change lands in a model file, not in PlayerBox JSX (§14).
- **View related cards (§9).** Desktop `addRelatedCardView`: on every card menu (battlefield, stack, graveyard/exile view, hand, library/sideboard view, revealed card), a "View related cards" submenu lists each related and reverse-related card. It appears once one relation resolves in the card catalog. An item shows the card in the card-info pane. The preview store gains `showCardInfo` as the single owner of these requests, and `BattlefieldSidebar` pushes each request onto its related-card stack, so the next hover resets it. The dead opponent-card placeholder is gone. Both pins of the placeholder are updated on purpose.
- **Reveal to… (§7).** Hand cards and library/sideboard view cards get desktop's hand-or-custom-zone card menu (`handCardMenu.model.ts` builds the items; `handCardMenu.actions.ts` resolves the targets and wires them to the seat's ports, and PlayerBox splices its result into `CardMenuPopup` with one line): Play, Play Face Down, Reveal to… (All players, a separator, then each other player), Clone, Move to (desktop MoveMenu), Draw arrow (hand only), Select All, Select Column (views only), View related cards, and token actions (hand only). The read-only branch applies without write access. The menu sends one `Command_RevealCards` with every selected id, and "All players" omits `player_id`. `SeatCardMenuState` gains `hand` and `zoneView` kinds, `RevealSelection` gains `{ cardIds }`, and a new shortcut `game.revealSelectedToAll` (desktop `Player/aRevealToAll`) is unbound by default. "Reveal hand to…" and "Reveal random card to…" now always list "All players", as desktop does.
- **Hide (§8).** A read-only reveal window gets desktop's revealed-card menu: Hide, Clone, Select All, View related cards. Hide is window-local and sends nothing. It never touches the shared `revealedCards` snapshot, and a new reveal clears it. Shortcut `game.hideRevealedCard` = Alt+H. Click selects a card; Ctrl/Cmd+click toggles it. Each card is a toggle button, so Space / Enter select from the keyboard.
- **Open deck in deck editor (§4, GAME-021).** This opens the deck being played as an unsaved draft, as desktop does. There is no name lookup among stored decks: `services/decks/deckHandoff` stages the `.cod` behind a one-read token, the new route `/deck/draft/:token` opens `DeckEditor` on it, and the draft's first save uploads it as a new deck (`deckUpload('', 0, xml)`). The editor then moves to that deck. Edits made while that upload is in flight are queued and saved to the new deck once its id arrives. The draft gets the deck-editor tab ("Unsaved deck"), and only the latest four drafts are kept in memory. File and clipboard decks open, duplicate names cannot pick the wrong deck, and printing fields survive.
- **Tally (§6, GAME-027).** Every player's menu has Tally (None / Subtypes / Total Power / Total Toughness). An overlay at the bottom right of the board shows the tally of the selection across every seat and zone. This ports Cockatrice 3.1's `Tally::compute` and is client-only. A separate commit adds desktop's selection count under it (from two selected cards).
- **Custom zones (§5, GAME-023).** The new `isBuiltinZone` (sockatrice) and a widened `ZoneEntry.name` (datatrice) feed `customZones` into the seat model. The own battlefield menu gets "Custom Zones" → "View custom zone '<name>'" after Sideboard, hidden while empty. The item opens the existing `ZoneViewDialog`.
- **Say (§10).** The own battlefield menu ends with Say: the message macros, disabled while there are none, each sent verbatim as `Command_GameSay`. On this branch there is no macro editor: the editor and the macro preference are branch 19's (see Review response). Shortcuts `game.sayMacro1–10` default to Alt+1…Alt+0, because browsers keep Ctrl+digit for tabs. The e2e run confirms Alt+1 reaches the page on chromium, firefox and webkit.

## Parity rows closed
- **GAME-021** Open current game deck in editor: closed.
- **GAME-027** Tally: closed. Subtypes, Total Power and Total Toughness match 3.1 master, plus the selection count.
- **GAME-023** Custom zones: menu and view done. Moving cards out of a custom-zone view and dumping a hidden custom zone are follow-ups. No stock server emits custom zones.
- game-gaps "extra gaps": Reveal to…, Hide, View related cards and the Say menu (its editor is LONG-011, branch 19; until that branch is below this one, nobody can create macros).

## Desktop reference
Cockatrice `add65caa`:
- `card_menu.cpp:132-151` (revealed branch), `:296-342` (hand / custom zone), `:360-406` (players menu, related view)
- `player_actions.cpp:51-98` (playCard), `:1214-1220` (say), `:1229-1252` (move X from top), `:1658-1685` (hide, reveal), `:1810-1822` (clone)
- `move_menu.cpp`, `hand_menu.cpp:165-200`, `player_menu.cpp:14-58`, `library_menu.cpp:48,203-205,259-303`
- `tab_supervisor.cpp:989-999`
- `tally_menu.cpp`, `game_graphics/tally/*`, `game_view.cpp:206-320`
- `custom_zone_menu.cpp`, `player_logic.cpp:98-170`
- `say_menu.cpp`
- `shortcuts_settings.h:503-505,560-562`

## Testing
Tip `5a8feae` (after the rv10 review fixes), from the repo root:
- `npx turbo run typecheck --concurrency=1`: 5/5 tasks pass.
- `npm run lint`: 3/3 tasks pass, 0 errors.
- `npm test -- -- --maxWorkers=2`: sockatrice 40 files / 776 tests, datatrice 29 / 1196, webatrice 253 / 2074. All pass.
- `npm run test:integration -- -- --maxWorkers=2`: sockatrice 19 / 166, datatrice 9 / 136, webatrice 38 files / 163 tests passed with 2 files / 2 tests skipped (both skips are already on the base, `0412500`; stage 5 restores them).
- Webatrice e2e: built on the host (`npm run build -w @cockatrice/webatrice`, `test:e2e:up`), run in `mcr.microsoft.com/playwright:v1.60.0-noble` against Servatrice 3.0.0 on chromium, firefox and webkit, with the host's docker CLI and socket mounted so `staff-tools.spec` can seed SQL: **45 passed, 0 failed (10.4 min)**, including `card-menus.spec` 9/9 with the tightened image assertion. Stack torn down.
- Sockatrice e2e: not run. Sockatrice code is unchanged by the review fixes; the only new wire fields (`pt` / `tapped` on `CardToMove`) are existing protocol fields sent through the webatrice seat port.
- Each behaviour fix adds a test that asserts the new behaviour. For the X-from-top, draft-upload and related-cards fixes, the test was also run against the pre-fix code and failed; the others assert attributes, fields or calls that did not exist before the fix.
- New specs:
  - unit: `playerMenu.model.spec`, `handCardMenu.model.spec`, `handCardMenu.actions.spec`, `revealedCardMenu.model.spec`, `tally.spec`, `useSelectionTally.spec`, `TallyOverlay.spec`, `useMessageMacros.spec`, `deckHandoff.spec`, `zoneNames.spec`, plus additions to `relatedCardActions`, `cardContextMenu.model`, `CardPreviewContext`, `IncomingRevealDialog`, `useDeckEditor`, `usePlayerZoneCommands`, `GameBoardCell`, `usePlayerSeatViewModel`, `useZoneViewDialog`, `Game.cardMenus`, `Game.zoneViews`, `Game.preview`, `Game.shortcuts`, `TopBar` and `cardCatalog`;
  - integration: `deck-draft.spec`, `game/custom-zones.spec`;
  - e2e: `card-menus.spec`, with 3 tests × 3 browsers.

## Notes for reviewers
- **Settings seam (branch 19).** Every macro reader (the Say menu and the Alt+digit shortcuts) goes through `useMessageMacros` (`features/game/hooks/useMessageMacros.ts`), which reads `webatrice.messageMacros` from localStorage and has no editor. Branch 19 exports `useMessageMacros(): readonly string[]` from `@app/hooks` with the same signature, so at the restack this file becomes `export { useMessageMacros } from '@app/hooks';` (the `Game.shortcuts` spec and the e2e Alt+1 test then seed branch 19's preference store instead of localStorage). `useTallyType` uses the `usePhaseTrackPinned` singleton pattern; swap it for `usePreference('tallyType')`. Each file says so.
- **Divergences.**
  - Say defaults are Alt+digit, not desktop's fixed Ctrl+digit, and they can be rebound.
  - The selection count is always on; desktop has a setting for it.
  - Tally counts a face-up card's printed P/T when it has no live P/T. Play and double-click now send the printed P/T (as desktop does), but drag-to-battlefield still doesn't.
  - The revealed-card menu leaves out Select Column; the web window has no columns.
  - Attach from the hand card menu is not wired yet.
  - A lent (writeable) reveal keeps its drag behaviour and gets no menu yet.
  - The game-level "Open deck in deck editor" is local-seat only. Desktop also offers it to a judge on another seat.
- **Not done here (w17a / spec §0.4):** the legacy reveal-to-all `playerId: -1` wire test and fix in `RevealCardsDialog` / `ZoneContextMenu` belong to w17a's commit 3. The seat path used by this PR already omits `player_id`.
- **PlayerBox still holds** the inline library pile menu, a near-duplicate of `libraryMenuItems` with small differences (it lacks some shortcut hints, and its grave index differs). Commit 0 left it unchanged so it stays a pure move; the review fix for "All players" changed both copies the same way. Deduplicate it in Phase 7.
- **Changesets:** webatrice minor, sockatrice minor (`isBuiltinZone`), datatrice minor (`ZoneEntry.name` widening; was patch).

## Review response (rv10)
- **major: inline hand / zone-view menu handler in PlayerBox JSX.** Fixed (`84f009a`). The target resolution, Play routing, Move switch and selection writes move into `context-menus/CardContextMenu/handCardMenu.actions.ts`: `resolveHandOrZoneCardMenu(deps)` takes the seat's state and ports and returns `{ items, anchor, disabled }`. PlayerBox computes it in its body next to its hooks (not in JSX) and renders it with one line, `{handOrZoneCardMenu && <CardMenuPopup {...handOrZoneCardMenu} onClose={closeSeatCardMenu} />}`. Because it is a pure function over an explicit dependency list, the restack moves the call into whichever stage-5 hook owns the seat's card menus (`usePlayerSeat` / `SeatCardMenus`) with no JSX involved. The reveal-to-all shortcut now calls `selectedHiddenZoneCards(seatId, selection, selectedCardKeys)` instead of carrying the logic in a closure. Behaviour was unchanged by that commit; a new spec (19 tests at that commit, 23 at the tip) pins every item's port call.
- **major: draft edits dropped while the first `deckUpload` is in flight.** Fixed (`e8e476d`). An edit in that window (or one still on the autosave debounce when the answer arrives) is queued; once the new id arrives it is saved to that deck as an update, and every later save goes to that id instead of uploading another new deck. The DECK_UPLOAD answer is now matched by the root path and the name Servatrice files the deck under (`deck name || "Unnamed deck"`, serversocketinterface.cpp:997-1000); a failure is matched by the root path. Sockatrice has no per-request callback on `deckUpload`, so that is the closest correlation without changing its API. Two new specs (fail before the fix): an edit in flight → exactly one `Command_DeckUpload` with `deckId 42` carrying the later XML, and an unrelated root upload is ignored. Leaving the editor while the first upload is in flight still loses the queued edit (the answer arrives after unmount); noted as a follow-up.
- **major: Say ships with no way to create macros.** No editor built here, by design: branch 19 (settings framework, with the macro editor and storage) sits below 17b in the final chain, so at the restack the macros become editable in Settings > Chat. This branch makes sure every reader goes through the one `useMessageMacros` hook, whose seam comment names the one-line swap (`08848ff`), and the changeset now says the Say menu sends "the message macros you set up in Settings" instead of implying they can be made in-game. On this branch alone Say stays disabled.
- **minor: library reveal menus show "(no players)" when alone.** Fixed (`dc4a497`) in `playerMenu.model` and in the library pile's own inline menu, both via `buildRevealToSubmenu`; the spec that pinned the divergence is flipped. Lend stays players-only.
- **minor: "X cards from the top" moves only the clicked card.** Fixed (`8419d9a`): the prompt takes the menu's targets and sends one `Command_MoveCard`.
- **minor: Clone sends empty color / pt / annotation / y.** Not changed. Desktop `cmClone` copies the card's current color, PT and annotation and its grid row (player_actions.cpp:1810-1822). A hand or library card has none of those: Servatrice resets a card's state when it leaves the battlefield and keeps annotations only on the stack (`PlayerCardViewModel.annotation` documents this), and a hidden-zone card has no grid row, so desktop sends the same empty values and y 0. The battlefield clone, where those fields exist, already passes them.
- **minor: Play omits pt / cipt and duplicates the routing.** Fixed (`599821f`). `playCardMove` (in `handCardMenu.actions.ts`) is the one routing helper for the hand menu's Play / Play Face Down, the hand double-click and the stack double-click. A face-up card landing on the battlefield carries its printed P/T and `tapped` when cards.xml says cipt; the catalog now reads `<cipt>`, and `SeatMoveCard` / the zone-command port send `pt` / `tapped` on the `CardToMove`. `hooks/playCard.ts` (the game-level menu's async path) is unchanged.
- **minor: "View related cards" missing for opponents' pile cards.** Fixed (`746f56c`): the seat's metadata lookup covers the stack, graveyard, exile and open zone views as well as the battlefield. New `Game.preview` test on an opponent's stack card.
- **minor: no tab for `/deck/draft/:token`.** Fixed (`76f2144`): the draft takes the single deck-editor tab as "Unsaved deck".
- **minor: draft maps never evicted.** Fixed (`48b1317`) by capping them at the latest four drafts. Evicting on unmount would break the StrictMode / tab-switch remount the maps exist for.
- **minor: thin integration spec.** Improved (`0d0dee2`): it now runs over a logged-in session (its "no deckDownload" assertion previously threw because no socket existed) and asserts that the first edit sends `Command_DeckUpload` as a new root deck whose XML keeps `setShortName`, `collectorNumber` and `uuid`. It still starts at the draft route, not the game menu; the menu → `stageDeckDocument` → navigate step is covered by the unit specs.
- **minor: reveal-window selection is mouse-only.** Fixed (`e3818c0`): role="button", aria-pressed, tabIndex 0, Space / Enter toggle.
- **minor: two live regions in the tally overlay.** Fixed (`5271278`): the count region is `aria-live="off"`, and both labels are in `TallyOverlay.i18n.json`.
- **nit: datatrice changeset level.** Now `minor` (`67f1220`).
- **nit: card-info request replays on remount.** Fixed (`6ce5b77`): `useCardInfoRequest(onRequest)` consumes each request after handling it.
- **nit: loose e2e image assertion.** Now asserts the exact token id only (`5a8feae`).


## Rebase onto stage 5 (w17r)

Branch `claude/restack-17b-game-menus`, tip `41f0d47`, on `claude/restack-17a-game-actions` (`57a3449`). 27 commits: 24 of the 25 above, ported, plus two new commits.

**Dropped: commit 0 (`157c0a5`, extract the PlayerBox menu arrays into `playerMenu.model`).** Stage 5 already moved those arrays into per-region hooks: `useLibraryMenuItems`, `useHandMenuItems`, `useBattlefieldMenuItems` and `usePileMenus`, each with a spec. The orchestrator confirmed the drop (M1).

**No central `playerMenu.model.ts` (M1).** Each new pure builder sits beside the hook that owns its region, with its own spec:

| builder | file | used by |
|---|---|---|
| `buildRevealToSubmenu` | `ui/PlayerBoard/revealRecipient.ts`, the module that already owns `toRecipient` | `useHandMenuItems`, `useLibraryMenuItems` and ZoneStack's library pile menu. The hand / zone-view card menu reaches it through `handCardMenu.model` |
| `buildTallyMenu` | `battlefield/Battlefield/tallyMenu.ts` | `useBattlefieldMenuItems`, own and opponent menus (desktop `player_menu.cpp:48`) |
| `buildCustomZonesMenu` | `battlefield/Battlefield/customZonesMenu.ts` | `useBattlefieldMenuItems`, after Sideboard (desktop puts Custom Zones in the player menu, not on a pile) |
| `buildSayMenu`, `SAY_MACRO_ACTIONS` | `battlefield/Battlefield/sayMenu.ts` | `useBattlefieldMenuItems` (own seat with `onSay`) and `useGameShortcuts` |

**Where each PlayerBox hunk went:**
- Related cards: `usePlayerSeat.relatedViewItemsFor` → `SeatCardMenus/{Battlefield,Stack,Pile}CardMenu`. The lookup widening (`746f56c`) is in `useSeatCardMetadata`, through a new `otherVisibleCards` argument.
- Hand / zone-view card menu:
  - It is the new `SeatCardMenus/HandCardMenu`, mounted in `PlayerBoard` beside the other three card menus.
  - The hand card's `onContextMenu` is in `HandZone`.
  - `usePlayerSeat` exposes `handCardMenu` / `zoneViewCardMenu`.
  - The `84f009a` refactor turns HandCardMenu into a call to `resolveHandOrZoneCardMenu`, so it has no logic of its own.
- Shortcuts and prompts:
  - `game.revealSelectedToAll` → `useSeatShortcutOperations`, which gains `seatId` and `selectedCardKeys`.
  - The `fromZone` / `cardIds` move-X prompt → `useSeatPrompts`.
- Play routing (`599821f`):
  - `playCardMove` routes the HandZone double-click with the settings preference "Play all nonlands onto the stack" (branch 19), and the StackColumn double-click with `fromStack`.
  - `cipt` joins `SeatCardMeta` and `seatCardMetaFromLookup`.
- `onSay` is a new `PlayerBoard` prop that `GameBoardCell` passes. Custom zones come from `zones.customZones` in `usePlayerSeat`.
- Deck draft (`3e1ff7b`, `e8e476d`, `48b1317`): branch 09 split the deck editor, so the port goes into the split hooks.
  - `useDeckAutosave` takes an optional `draft` option. A draft's first save is a root `deckUpload`, matched by root path and name ("Unnamed deck" fallback). Edits made while it is in flight, or waiting on the debounce, are saved to the new id with `deckUpdate`. Later saves go to that id.
  - `useDeckEditor(deckId, draftToken)` loads the draft and moves to `/deck/:id` once it is stored.
  - Draft documents and states live in `deckEditorCache.ts` (cap 4).
  - Specs: `hooks/useDeckEditor.draft.spec.tsx` has 6 tests. The two in-flight tests fail against the pre-fix autosave. `useDeckEditor.deckSwitch.spec` now wraps the hook in a router.

**New commit 26, `feat(game): read Say macros from the settings store`.** Branch 19 is below, so:
- `features/game/hooks/useMessageMacros.ts` is now the one-line seam `export { useMessageMacros } from '@app/hooks'`. The localStorage fallback and its spec are deleted.
- `Game.shortcuts` seeds the macros through the mocked preference store.
- The e2e Alt+1 test adds its macro in Settings > Chat (user menu → Settings → Chat → "New message" → "Add New Message") before it joins the room. `flows.ts` exports `joinFirstRoom` for that.
- The Say items, the Alt+digit defaults and the `Command_GameSay` payloads are unchanged.

**Other pin edits:**
- The opponent battlefield menu now ends with Tally in `Battlefield.spec` and `useBattlefieldMenuItems.spec`. The latter also gains Say / custom-zone cases.
- `GameBoardCell.spec`'s reveal case asserts `{ cardIds }` through the port.
- `useSeatPrompts.spec` passes `cardIds`.

**New commit 27, `test(e2e): answer Scryfall's batch card lookup in the hermetic network fixture`.** The hermetic network fixture comes from the e2e-hardening branch below. It had no stand-in for `POST /cards/collection`, which the seat's metadata lookup reaches through `lookupCards`, so the related-cards e2e failed on all three browsers. The fixture now answers the endpoint and its CORS preflight from the Scryfall fixtures.

**Testing at `65687b0` (`41f0d47` changes only the e2e fixture):**
- `turbo typecheck` passes at every one of the first 26 commits. At `41f0d47`, `tsc -p e2e` and eslint on `e2e` pass. Lint: 3/3, 0 errors.
- Unit: sockatrice 43 files / 896 tests, datatrice 35 / 1316, webatrice 461 / 3647. All pass.
- Integration: sockatrice 20 / 175 and datatrice 10 / 145 pass. Webatrice: 52 files, 270 / 271 tests pass. The one failure is `invite-link.spec` "a link clicked in a room's chat opens the game with one navigation (Back returns to the room)". It fails the same way on the base `claude/restack-16-game-lobby` and at the 17a tip, so it is not caused by this branch.
- Webatrice e2e, run on the host build against Servatrice 3.0.0 in `mcr.microsoft.com/playwright:v1.60.0-noble`, on chromium, firefox and webkit, with the host docker CLI and socket mounted for `staff-tools`:
  - At `65687b0`: 75 passed, 3 failed, 12 skipped (the 3.1-only specs on a 3.0.0 server), in 19.1 min. All three failures are the related-cards test, from the missing collection stub above.
  - At `41f0d47`: `card-menus.spec` 9/9 (3 tests × 3 browsers), including Alt+1 with the macro set up in Settings > Chat. `game-menu.spec` (17a) passed on all three browsers in the full run.
  - The full suite was not re-run after the fixture-only commit. It was re-run at the f17 tip; see "Review response (rv16, f17)" below.
- Sockatrice e2e: not run. No sockatrice flow changed; `isBuiltinZone` is a pure helper.

**Follow-ups:**
- `useTallyType` still uses its localStorage singleton. Branch 19 has no `tallyType` preference to swap to, and adding one is outside this task.
- `usePileMenus`' "Reveal random card to..." still shows "(no players)" when alone. 17b never changed the pile menus.
- Stage 5's two library menus (ZoneStack's inline one and `useLibraryMenuItems`) both carry the reveal-to fix. Folding them into one is still the stage-5 follow-up.

## Review response (rv16, f17)

Tip `5023cfa` on `claude/restack-17b-game-menus`. 17b's own 27 commits were rebased with a plain `git rebase --onto` (no conflicts) onto the new 17a tip `fc80478`, which carries the rv16 M1 / M2 fixes. Four commits sit on top.

- **M3: inexact e2e count.** The full suite was re-run at this tip (exact counts under Testing below), and the "Testing at `65687b0`" note now points there.
- **HandZone / StackColumn wiring specs** (`test(game): pin the hand and stack double-click play payloads`):
  - `HandZone.spec`: with "Play all nonlands onto the stack" off, a creature in the seat's deck goes to TABLE with `{cardId, pt: '2/2', tapped: true}`. The seat's deck prefetch fills `cardMetaByName` with a 2/2 cipt creature, and the double-click does no fresh lookup.
  - `StackColumn.spec`: the same 2/2 cipt creature resolves from the stack to TABLE with `{pt: '2/2', tapped: true}`. Here the visible-card prefetch fills the metadata.
  - Both fail when the components stop passing the `cardMetaByName` entry to `playCardMove`.
- **Nits:**
  - `useGameShortcuts`: the seat-scoped comment moved back above `SEAT_SHORTCUT_ACTIONS`. The Say comment now says desktop binds Ctrl+digit and the browser defaults are Alt+digit.
  - `playCardMove` doc: it now says the HandZone double-click passes the preference as `playToStack`.
  - `EMPTY_CARD_KEYS` is declared once, in `ui/GameSelectionContext.tsx`, beside the selection it stands in for. `HandCardMenu` passes `keys` straight through.
  - `features/game/hooks/useMessageMacros.ts` is deleted. Both readers import `useMessageMacros` from `@app/hooks`, as `MessageMacrosEditor` does.
- **Not applied here:** the `autoPlayCard` pt / tapped minor. It belongs to R1, which rewrites that path.
- **Testing at `5023cfa`:**
  - `turbo typecheck` passes. Lint: 3/3.
  - Unit: sockatrice 43 files / 896 tests, datatrice 35 / 1316, webatrice 461 / 3655. All pass. That is 3647 + 8: the 6 new 17a specs and the 2 wiring specs.
  - Integration: sockatrice 20 / 175 and datatrice 10 / 145 pass. Webatrice: 52 files, 270 / 271. The one failure is the known `invite-link.spec` "a link clicked in a room's chat opens the game with one navigation". rv16 reproduced it on the base `d2e516c`.
  - Webatrice e2e: the full suite on chromium, firefox and webkit.
    - Setup: host build, `test:e2e:up` against Servatrice 3.0.0, Playwright run in `mcr.microsoft.com/playwright:v1.60.0-noble`, with the docker CLI, the compose plugin and the socket mounted for `staff-tools`.
    - Result: **78 passed, 0 failed, 12 skipped (the 3.1-only specs), 15.5 min.**
    - The run was at `a065b30`. `5023cfa` differs from it only in `.github/instructions/webatrice.instructions.md` (17a's doc commit `fc80478`, rebased under).
  - Sockatrice e2e: 4 files / 5 tests pass.

## Restack notes (wR4a)

Replayed on fx16-folded 16 (no conflicts); tip `0b80cec`. The per-commit typecheck found two red commits from f17: `docs(game): say where the play-to-stack preference enters playCardMove` also deleted `features/game/hooks/useMessageMacros.ts` while its readers still imported it. The deletion now lives in `refactor(game): read message macros from @app/hooks and fix the Say comment`, which moves the readers; the tip tree is unchanged and every commit typechecks.
