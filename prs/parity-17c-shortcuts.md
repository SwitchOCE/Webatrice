# feat(shortcuts): desktop's game shortcut catalogue

## Summary

Part C of the game-actions PR (spec `specs/w17.md` §11). It adds the 75 game shortcuts that desktop has and the web client could not bind. It also sorts the Shortcuts tab into desktop's groups, so the game list stays readable. Base: `claude/parity-r1-card-ops-seam` at `178bf75` (R1 after its rv20 review fixes). This branch was first built on `2f6e5b6` and rebased per orchestrator M1. Only one test conflict needed resolving, and no shortcut-table entry needed changes: none uses the changed APIs (`BattlefieldCardOps.targets`, the pending pointer, `useBattlefieldMenuItems`' `selection`).

Each new ActionId is an entry in R1's `useSeatShortcutOperations` table (or, for the phases, one `useGameShortcuts` group) that calls an op from a seat seam. Where an op lived only in a menu or region hook, it moved into a seam first.

- **Card ops seam (`useBattlefieldCardOps`).** Gains `createRelatedTokens()`, desktop `actCreateAllRelatedCards` (player_actions.cpp:977-1061). The pure rule is `createAllRelated` in `relatedCardActions.ts`: exactly one related action (a transform included) runs as its menu item does; otherwise, of the relations neither marked `exclude` nor attaching, exactly one runs the same way, none (all excluded) falls back to every non-attaching fixed-count relation, and more creates each fixed-count one. A run relation with an `x` / `x=N` count goes through desktop's "Create tokens" count prompt (player_dialogs.cpp:198-213, 1-99). The first relation run becomes the seat's last token unless it attaches (player_actions.cpp:1053-1061), so "Create another token" repeats it. `RelatedCardRef` now carries cards.xml's `exclude`. The card menu builds its "Token: …" items through `buildRelatedActionItems`, which adds desktop's "All tokens" item when there is more than one token and puts the create-all hint on whichever item runs it; that item (and a lone token item) runs the seam's `createRelatedTokens`, so menu and shortcut share one path. The Transform item's hard-coded `Ctrl+Shift+T` chip, which had no binding, is gone.
- **Hand card ops seam (new `useHandCardOps`).** `forSelection()` gives `play(faceDown)` and `move(to)` on the selected hand cards. Play shares `playCardMoves` with the hand card menu; every "Move to" (hand menu, zone-view menu, battlefield ops and the move-selection shortcuts) goes through one helper, `moveSelectedCards` (`PlayerBoard/selectionMoves.ts`), desktop `cardMenuAction`:
  - onto the battlefield from another zone, one Command_MoveCard per card with x −1, y = `tableRowToGridY(row)`, the printed P/T, `tapped` = cipt, face up (cmMoveToTable, player_actions.cpp:1925-1950). An instant goes to the battlefield too (row 3 folds to the middle row); the row comes from the type line, the same policy as Play;
  - to the top or bottom of the library, more than one card also sends Command_Shuffle over the moved block, `[0, N−1]` / `[−N, −1]`, in the same container (player_actions.cpp:1853-1888). This needed a Sockatrice command, `request.game.moveCardAndShuffle`, which queues the shuffle first because Servatrice runs a container's game commands last to first (server_protocolhandler.cpp:302).
- **Tap.** Tap / Untap (menu and `game.tapCard`) flips each card, desktop cmTap (player_actions.cpp:1768-1776). A double-click is desktop's other action, `TableZone::toggleTapped` (table_zone.cpp:250-280): tap all when any is untapped, else untap all, sending only the cards that change. It now has its own op, `tapOrUntapAll`.
- **Library ops seam (new `useLibraryOps`).** Holds the top / bottom card moves, the move-N prompts and the shuffle-top/bottom prompts. It owns the prompts' titles and submit labels (`libraryMovePrompt`), so the menu and the shortcuts cannot drift. They were written twice: in `useLibraryMenuItems` and in the library pile's inline menu in `ZoneStack`. Both menus now use the seam, and the pile reuses the battlefield menu's two submenus (`topLibraryItems` / `bottomLibraryItems`). The wire is unchanged: the pile copy's missing `index` already went out as `x: 0`.
- **Groups.** `ShortcutGroupId` gains desktop's groups: Card Counters, Player Counters, Power and Toughness, Game Phases, Playing Area, Move Selected Card, View, Move Top Card, Move Bottom Card, Gameplay, Drawing, Hand. `defaults.ts` is regrouped into one commented section per group, and existing comments move with their entries. `game` keeps only the Say macros and Focus chat. The tab lists the groups in desktop's enum order.
- **Hints.** Every new action shows its binding where the menu has the item:
  - card menu: Tap, Move to Top / Table / Hand / Exile, the P/T flows, card counters D–F;
  - hand card menu: Play, Play Face Down, the moves;
  - hand menu: View hand, Sort by name / mana value, Reveal hand / random card → All players;
  - exile pile: View exile;
  - library menus: every Top / Bottom of library item;
  - the Counters submenus: Set / +1 / −1 for life, each mana pip, and Other.

### Commits (oldest first; each typechecks on its own)

1. `feat(shortcuts): add desktop's playing area, move selected, view and hand shortcuts` (14 ids). The `defaults.spec` table test lands here: no sequence bound twice in a scope, every action and group labelled, no game default on a browser-reserved key. Also the handler-coverage test in `useGameShortcuts.spec` (every GAME-scope action has a handler) and the new `ShortcutsTab.spec`.
2. `feat(shortcuts): add desktop's move top card, move bottom card and gameplay shortcuts` (19 ids, `useLibraryOps`).
3. `feat(shortcuts): add desktop's card counter, player counter, P/T and phase shortcuts` (42 ids).
4. `chore(changeset): game shortcut catalogue`: `@cockatrice/webatrice` minor.

Review fixes (rv23), each its own commit on top, no history rewrite:

5. `fix(game): honour create-all exclusions and prompt for an "x" count`
6. `fix(game): let "Create another token" repeat what create-all made`
7. `feat(sockatrice): send a library move and its shuffle in one container` (`.changeset/sockatrice-move-card-and-shuffle.md`, `@cockatrice/sockatrice` minor)
8. `fix(game): move selected cards to the battlefield and library as desktop does`
9. `fix(shortcuts): share the browser-reserved chord list and check every scope`
10. `refactor(game): let LibraryOps title its top and bottom move prompts`
11. `fix(game): tap and untap selected cards the way desktop does`
12. `test(game): drive each desktop shortcut group from its key to its request`
13. `refactor(shortcuts): hand useShortcutGroup's handler the action's index`
14. `test(shortcuts): check the Shortcuts tab's buttons are keyboard reachable`
15. `chore(changeset): describe the review fixes to the shortcut catalogue`

### Remapped browser-reserved desktop defaults

| Action | Desktop | Web default | Why |
|---|---|---|---|
| `game.createRelatedTokens` | Ctrl+Shift+T | Ctrl+Shift+K | Reopens a closed tab and cannot be cancelled. Follows Create token's Ctrl+T → Ctrl+K. |
| `game.incLife` | F12 | Shift+F12 | Opens the devtools. Alt+= is taken by Add toughness (`game.incT`), so the spec's suggestion would collide. |
| `game.decLife` | F11 | Shift+F11 | Toggles fullscreen. Alt+- is taken by Remove toughness (`game.decT`). |
| `game.setPhase0` / `2` / `3` / `4` / `9` / `10` | F5 / F6 / F7 / F8 / F9 / F10 | unbound | F5 reloads, F6 focuses the address bar, F7 is caret browsing, F10 is the menu bar. All eleven phase actions ship unbound, as the spec says. |

Earlier remaps are unchanged: untap all Ctrl+U (not F5), always reveal / look at top card Ctrl+Alt+(Shift+)N, view top / bottom cards Ctrl+Alt+(Shift+)W, create token Ctrl+K, Say macros Alt+digit. `game.moveTopToPlayFaceDown` keeps desktop's Ctrl+Shift+E. Every other new action is unbound on desktop and here.

## Parity rows closed

- game-gaps / matrix shortcut-catalogue row (spec §11): every desktop `Player/*` game shortcut now has a web ActionId with a handler. The exceptions are `unfocusTextBox` and `aResetLayout`, which are N/A (no dock layout).

## Desktop reference

Cockatrice `add65caa`:
- `client/settings/shortcuts_settings.h:19-80` (groups), `:300-745` (every `Player/*` default);
- `game/player/player_actions.cpp`: `cardMenuAction` (1761-1990): cmTap per card (1768-1776), cmMoveToTopLibrary / cmMoveToBottomLibrary with the block shuffle (1853-1888), cmMoveToTable (1925-1950); `actCreateAllRelatedCards` (977-1050) and its `setLastToken` (1053-1061); `createRelatedFromRelation` (1071-1118); `moveTopCardsTo` (475), `moveBottomCardsTo` / `actDrawBottomCards` (673, 798), shuffle ranges (267-268, 298-299);
- `game_graphics/player/player_dialogs.cpp:198-213` (the "Create tokens" count prompt, 1 to `MAX_TOKENS_PER_DIALOG` = 99, `game/player/player_logic.h:62`);
- `game_graphics/zones/table_zone.cpp:250-280` (`TableZone::toggleTapped`, the double-click), `:409-415` (`tableRowToGridY`);
- `libcockatrice_card/.../parser/cockatrice_xml_4.cpp:379-421` (`exclude`, `count="x"` / `"x=N"`), `relation/card_relation.h:111-124` (`getCanCreateAnother`, `getIsCreateAllExclusion`);
- `libcockatrice_network/.../server/remote/server_protocolhandler.cpp:302` (a container's game commands run last to first);
- `game_graphics/player/menu/card_menu.cpp:407-479` ("All tokens" and the create-all shortcut placement).

## Testing

Run from the repo root on the rebased tip `3a78d2f`:

- `npx turbo run typecheck --concurrency=1`: 5/5 pass. Per commit: `tsc --noEmit` and `tsc -p e2e --noEmit` pass at each of `91f1811`, `986924b`, `c59355e` and `3a78d2f`.
- `npm run lint`: 3/3 pass. `npm run translate` leaves `i18n-default.json` unchanged.
- Unit: sockatrice 43 files / 896, datatrice 35 / 1316, webatrice **473 files / 3960 tests, all passing**, run in two invocations (`src/features/game`: 155 / 1613; everything else: 318 / 2347). A single `npm test -- -- --maxWorkers=2` invocation of webatrice is killed by the kernel (OOM, 137) in this 16 GB container. The base (`2f6e5b6`) already peaks at ~14 GB in that run (measured; it passes with 467 / 3822), and this branch's added `<Game />` renders cross the limit. See follow-ups.
- `npm run test:integration -- -- --maxWorkers=2`: sockatrice 20 / 175, datatrice 10 / 145, webatrice 51 of 52 files / 270 of 271 tests. The one failure is `invite-link.spec.tsx` › "a link clicked in a room's chat opens the game with one navigation". It fails identically in a full run on the base (checked), as R1 recorded, and passes when run alone on both. It is pre-existing and unrelated.
- E2E (webatrice): `npm run build`, then `test:e2e:up` (Servatrice 3.0.0), then `mcr.microsoft.com/playwright:v1.60.0-noble` with the host's docker CLI and compose plugin mounted (so `staff-tools.spec` can seed SQL), on chromium + firefox + webkit: **78 passed, 12 skipped, 0 failed (13.1 min)**. Stack torn down. The pre-rebase tip got the same result. Sockatrice e2e was not run: no sockatrice or server-flow change.
- New and extended specs:
  - `defaults.spec`: the table test and the browser-reserved keys;
  - `ShortcutsTab.spec` (new): group order, each new group renders its actions, keyboard-reachable headers and edit buttons;
  - `useGameShortcuts.spec`: every GAME-scope action has a handler; the phase keys;
  - `Game.cardOps.characterization.spec`: the seat-action table extended with all 64 new seat ids (the coverage check still requires every one), plus the hand and exile views;
  - `Game.shortcuts.spec`: one action per group from key to request, sent exactly once (Ctrl+Delete on a hand selection, Ctrl+Shift+E, a bound draw-bottom, a bound shuffle-top prompt, Shift+F12/F11 with F12 left to the browser, a bound phase key, reveal hand). A spectator's key reaches no seat op and is not consumed;
  - `useSeatShortcutOperations.spec`, `useBattlefieldCardOps.spec`, `relatedCardActions.spec`, `useLibraryMenuItems.spec`, `useBattlefieldMenuItems.spec`, `cardContextMenu.model.spec`, `handCardMenu.model.spec`;
  - new `useHandCardOps.spec`, `useLibraryOps.spec`.

## Notes for reviewers

- **Behaviour change:** `game.moveSelectedToGrave` (Ctrl+Delete) and `game.moveSelectedToLibraryBottom` (Ctrl+B) now also move a *hand* selection, as desktop's `cardMenuAction` moves the scene selection from any zone. The hand card menu already showed those two hints. All six Move Selected actions behave this way.
- **Naming:** the spec's `game.{inc,dec,set}Counter{W,U,B,R,G,X}` collides with the existing card-counter id `game.setCounterB`. The mana-pool ids are `game.{inc,dec,set}ManaCounter{W,U,B,R,G,X}`; desktop's `x` is the colorless (C) pip.
- **Life keys** deviate from the spec (Shift+F12/F11, not Alt+=/-) because of the collision above. They are rebindable.
- **Play / Play face down** act on the hand selection, and Tap / Create related tokens on the battlefield selection (desktop's active card is the anchor). Desktop's tap also works on the scene selection's table cards only.
- **Spec §11's "`viewHand` / `viewExile` → openZoneView"** are seat entries over `GameDialogs.openZoneView`. The existing game-level `viewLibrary` / `viewGraveyard` / `playTop` / `moveTopToGrave` / `moveTopNToGrave` / `sortHandByType` paths through `useGame` are left as they were; moving them onto the seat table is a follow-up.
- **Focus guard (G1):** no change to `focusGuards`; every new binding goes through the same provider. The Shortcuts tab's group headers and row edit controls are native, focusable buttons in the tab order (`ShortcutsTab.spec` checks that; jsdom cannot press Enter on them).
- **Reserved chords:** `feature-widgets/shortcuts/browserReserved.ts` is PR 31's file (`d7084c5`) with the same `BROWSER_RESERVED_SEQUENCES`, plus a comment recording why Ctrl+L, Ctrl+Q and Alt+1…9 stay off it. `defaults.spec` checks every scope, comparing normalised sequences. **`deck.new` (Ctrl+N) is listed in `defaults.spec`'s `PENDING_REMAP`**: excluded from the reserved check, and a second test asserts it is still on a reserved chord. PR 31 rebinds it to Ctrl+Alt+N; its replay onto this branch must delete the `PENDING_REMAP` entry (and reuse this `browserReserved.ts` rather than adding its own).
- **Seat-action coverage:** a seat ActionId missing from `SEAT_SHORTCUT_ACTIONS` is caught by `useGameShortcuts.spec` (handler coverage), `Game.cardOps.characterization` ("covers every seat action") and `useSeatShortcutOperations.spec`, not by `defaults.spec`, which lives in `feature-widgets` and cannot import the game feature (boundaries).
- **Ctrl+Shift+E / Ctrl+Shift+K** are Firefox devtools keys (network monitor / web console). Like the existing Ctrl+Shift+I (flip coin), they are left as defaults.

## Review response (rv23)

| Finding | Change |
|---|---|
| major: create-all ignored `exclude`; a lone `x` relation created silently | `createAllRelated` implements desktop's three branches, with a count prompt for an `x` relation; `RelatedCardRef.exclude` carried from cards.xml (and through the Scryfall overlay). `relatedCardActions.spec` has a case per branch, `cardCatalog.spec`, `useBattlefieldCardOps.spec`, `seatPrompts.spec`, `useSeatPrompts.spec`. |
| major: hand → battlefield sent one `x 0, y 0` move | `moveSelectedCards` / `tableMove`, used by the hand shortcut, `HandCardOps.move`, the hand / zone-view menu and the battlefield ops. Not `playCardMoves(…, false)` as suggested: Play sends an instant to the stack, while cmMoveToTable puts it on the battlefield. Specs: `selectionMoves.spec`, `useHandCardOps.spec`, `handCardMenu.actions.spec`, `useSeatShortcutOperations.spec`. |
| major: multi-card library top / bottom had no shuffle | `request.game.moveCardAndShuffle` (Sockatrice) behind `SeatMoveDestination.shuffleMoved`, set by `moveSelectedCards`. Specs: `gameCommands.spec`, `usePlayerZoneCommands.spec`, characterization (shortcut and menu). |
| major: own reserved list, GAME scope only | PR 31's `browserReserved.ts`, every scope; `deck.new` as a named pending remap (orchestrator M1). |
| minor: duplicate check keyed on the raw string | keyed on `normalizeSequence`; the `Shift+Ctrl+KeyK` mutation now fails it. |
| minor: §11 seat-ActionId claim | PR text corrected (see Notes); `defaults.spec` cannot import the game feature. |
| minor: prompt titles duplicated | `libraryMovePrompt` in `useLibraryOps`; the ops take only destination and face-down. |
| minor: two hand play / move implementations | one move helper (above); Play already shared `playCardMoves`. Target resolution stays per entry point: the menu acts on the clicked card unless it is in the selection, the shortcut on the selection. |
| minor: tap from the anchor | per-card flip (cmTap); the double-click gets desktop's own `TableZone::toggleTapped` instead of sharing it. Characterization updated for both. |
| minor: create-all did not set `lastToken` | set from the first relation run unless it attaches, also when the count prompt is cancelled (desktop sets it before the dialog result matters). Seat-op spec: Ctrl+Shift+K then Ctrl+G repeats it. |
| minor: Game.shortcuts representatives | the shuffle prompt is answered and `shuffle` asserted once; new key → request cases for add counter D, flow P, tap, view exile. |
| nit: ShortcutsTab "keyboard" test | asserts native, focusable, tab-order buttons; renamed accordingly (no user-event in this repo, and jsdom does not click on Enter). |
| nit: phase `indexOf` cast | `useShortcutGroup` passes the action's index. |
| nit: Ctrl+L / Ctrl+Q / Alt+digit | recorded in `browserReserved.ts`; Ctrl+Q and Alt+digit are a follow-up. |

Follow-ups:
- Ctrl+Q (`game.leaveGame`) quits Firefox on Linux, and Alt+1…9 (Say macros) switch tabs on Linux: decide whether to remap them there.
- A single "Token: X …" item in a multi-token menu, and the hand menu's token items, still create one token without the count prompt, and do not set the last token (desktop `actCreateRelatedCard` / `onRelatedCardCreated`). Only create-all (and a lone token item, which runs create-all) follows desktop now.
- The move-to-battlefield row uses the type-line policy, like Play; desktop reads cards.xml's `tablerow`. That is the open row-policy decision in `cardPlacement.ts`.
- The per-card table moves and the two tap groups go out as separate containers where desktop sends one; the server result is the same.
- The webatrice unit suite (`vmThreads` pool) peaks near the 16 GB container limit in a single `--maxWorkers=2` run; a `vmMemoryLimit` or `pool: 'threads'` change would fix that; it is not part of this PR.
- Fold the remaining game-level shortcut handlers in `useGame` onto the seat table.
