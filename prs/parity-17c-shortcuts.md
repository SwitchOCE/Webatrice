# feat(shortcuts): desktop's game shortcut catalogue

## Summary

Part C of the game-actions PR (spec `specs/w17.md` §11). It adds the 75 game shortcuts that desktop has and the web client could not bind. It also sorts the Shortcuts tab into desktop's groups, so the game list stays readable. Base: `claude/parity-r1-card-ops-seam` at `178bf75` (R1 after its rv20 review fixes). This branch was first built on `2f6e5b6` and rebased per orchestrator M1. Only one test conflict needed resolving, and no shortcut-table entry needed changes: none uses the changed APIs (`BattlefieldCardOps.targets`, the pending pointer, `useBattlefieldMenuItems`' `selection`).

Each new ActionId is an entry in R1's `useSeatShortcutOperations` table (or, for the phases, one `useGameShortcuts` group) that calls an op from a seat seam. Where an op lived only in a menu or region hook, it moved into a seam first.

- **Card ops seam (`useBattlefieldCardOps`).** Gains `createRelatedTokens()`, desktop `actCreateAllRelatedCards`: it runs the card's only related action, otherwise every token that neither attaches (transform included) nor asks for a count (`x`). The pure rule is `createAllRelatedRequests` in `relatedCardActions.ts`. The card menu builds its "Token: …" items through the same file's `buildRelatedActionItems`. That builder adds desktop's "All tokens" item when there is more than one token, and puts the create-all hint on whichever item runs it. The Transform item's hard-coded `Ctrl+Shift+T` chip, which had no binding, is gone.
- **Hand card ops seam (new `useHandCardOps`).** `forSelection()` gives `play(faceDown)` and `move(to)` on the selected hand cards. They do exactly what the hand card menu's Play / Play Face Down / Move to do, and share `playCardMoves` with it.
- **Library ops seam (new `useLibraryOps`).** Holds the top / bottom card moves, the move-N prompts and the shuffle-top/bottom prompts. They were written twice: in `useLibraryMenuItems` and in the library pile's inline menu in `ZoneStack`. Both menus now use the seam, and the pile reuses the battlefield menu's two submenus (`topLibraryItems` / `bottomLibraryItems`). The wire is unchanged: the pile copy's missing `index` already went out as `x: 0`.
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
- `game/player/player_actions.cpp`: `cardMenuAction` (1761-1990), `actCreateAllRelatedCards` (977-1062), `moveTopCardsTo` (475), `moveBottomCardsTo` / `actDrawBottomCards` (673, 798), shuffle ranges (267-268, 298-299);
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
- **Focus guard (G1):** no change to `focusGuards`; every new binding goes through the same provider. The Shortcuts tab stays keyboard-navigable (group headers and row buttons are native buttons; see `ShortcutsTab.spec`).
- **Ctrl+Shift+E / Ctrl+Shift+K** are Firefox devtools keys (network monitor / web console). Like the existing Ctrl+Shift+I (flip coin), they are left as defaults.

Follow-ups:
- `deck.new` is Ctrl+N (deck editor scope), which browsers keep. It is outside this PR's game scope, and the reserved-key test checks GAME scope only.
- The webatrice unit suite (`vmThreads` pool) peaks at ~14 GB of 16 GB on the base and now crosses it in a single `--maxWorkers=2` run in this container. A `vmMemoryLimit` or `pool: 'threads'` change would fix that; it is not part of this PR.
- Fold the remaining game-level shortcut handlers in `useGame` onto the seat table.
