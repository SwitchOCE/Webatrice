# aud2: architecture audit of the remaining large files

Base: `origin/claude/restack-16-game-lobby` @ `d2e516c`. This is a read-only audit and no code was changed.
Paths are relative to `packages/<pkg>/src/`, where `W/` = webatrice and `D/` = datatrice, and `G/` = `W/features/game/`.
Line numbers are at `d2e516c`.

## 1. Non-test source files over 500 lines

| Lines | File |
|---:|---|
| 1057 | `D/store/games/game.listeners.ts` |
| 1057 | `G/components/ui/ZoneStack/ZoneStack.tsx` |
| 1041 | `G/dialogs/ZoneViewDialog/ZoneViewPanel.tsx` |
| 1032 | `W/services/cards/cardCatalog.ts` |
| 908 | `G/dialogs/IncomingRevealDialog/IncomingRevealDialog.tsx` |
| 860 | `W/feature-wrappers/layout/TopBar.tsx` |
| 857 | `D/store/games/messageLog.ts` |
| 827 | `G/GameLobby.tsx` |
| 707 | `G/components/context-menus/SeatCardMenus/BattlefieldCardMenu.tsx` |
| 679 | `G/components/ui/PlayerBoard/useSeatShortcutOperations.ts` |
| 668 | `G/components/BattlefieldSidebar/BattlefieldSidebar.tsx` |
| 627 | `G/hooks/useGameArrowInteractions.ts` |
| 505 | `W/images/countries/_Countries.ts` |
| 502 | `W/services/decks/cockatriceDeckDocument.ts` |

- No file in sockatrice is over 500 lines. The largest is `services/ProtobufService.ts` at 425.
- Generated code is excluded.
- Just under the line, between 400 and 500: `Battlefield.tsx` 480, `useLibraryMenuItems.ts` 476, `useDeckEditor.ts` 457, `FilterGamesDialog.tsx` 449, `usePlayerSeat.tsx` 449, `ZoneRevealPanel.tsx` 444.
  - `ZoneRevealPanel` holds the third copy of the floating-panel helpers (D3 below).

## 2. Verdicts

| File | Lines | Verdict | Problem | Proposed split (target modules · idiom to follow) | Effort | Conflicts with planned PRs |
|---|---:|---|---|---|---|---|
| `ZoneStack.tsx` | 1057 | refactor | **The library menu is defined twice:**<ul><li>inline at `:267-930`;</li><li>in `useLibraryMenuItems.ts:190-474`, which `usePlayerSeat.tsx:252` already builds and exposes as `libraryMenuItems`.</li></ul>The two copies have drifted: only the hook carries the `game.playTop` / `game.moveTopToGrave` / `game.moveTopNToGrave` hints, so the pile menu and the Battlefield → Library submenu disagree.<br><br>Also:<ul><li>`LargeZoneBox` (`:40-138`) and `CardBackZone` (`:139-234`) are near-twins.</li><li>The owner/opponent `ContextMenu` + box block is written four times (`:933-1053`).</li></ul>Layering is clean (seat ports only). `ZoneStack.spec` (4 tests) reaches only the first library item. | <ul><li>Read `libraryMenuItems` from `usePlayerSeatContext()` and delete the inline array (≈ −660 lines).</li><li>Merge the boxes into `ui/ZoneStack/PileBox.tsx` with an `art` prop.</li><li>Map over the `[library, grave, exile]` descriptors.</li><li>Idiom: `usePileMenus.ts`, where the region renders and a hook owns the items.</li></ul> | S | **30 owns the de-dup** ("single library menu"). 17c binds library shortcuts, which must reach the hook, not the inline closures. 32 would otherwise extract the strings twice. |
| `ZoneViewPanel.tsx` | 1041 | refactor | **A god component with five jobs:**<ol><li>floating chrome: position/size `localStorage` at `:44-142` and window drag at `:327-470`;</li><li>view preferences: group/sort/pile, each with its own key and effect, at `:219-316`;</li><li>a dialog-scoped marquee (`:472-602`) that re-implements `PlayerBoard/useSeatMarquee.ts` / `hooks/useGameBoxSelection.ts`;</li><li>catalog metadata enrichment at `:608-653`;</li><li>the grid and pile renderers, with the card cell written twice (`:878-945` vs `:975-1000`).</li></ol>Layering is clean: props only, and `ZoneViewDialog` owns Redux/protocol. No spec targets this file directly. Untested: marquee, pile view, persistence and clamping, `metadataLoaded` gating, query filter. | <ul><li>`dialogs/shared/useFloatingPanelGeometry.ts` (keyed by storage prefix)</li><li>`dialogs/shared/useZoneViewPreferences.ts` (extends `zoneViewPreferences.ts`)</li><li>`dialogs/shared/useCardCatalogMeta.ts`</li><li>`dialogs/shared/ZoneCardGroups.tsx` + a single `ZoneCardCell`, with a `renderCell` slot</li><li>reuse `useSeatMarquee`, or generalise it to `useMarquee`</li><li>Idiom: `useZoneViewDialog.ts` + `zoneViewSort.ts` (pure, specced); parity-09 façade + hooks + policy.</li></ul> | M | 25b: zone-view search autofocus (`:777`), group/sort as prefs. 29: DialogShell (G13/G14) replaces the chrome. 30: `useGridRows` roving focus needs the single cell. 32: toolbar strings. |
| `IncomingRevealDialog.tsx` | 908 | refactor | **A copy-paste fork of ZoneViewPanel.** It repeats the storage/clamp helpers (`:57-141`, with a diverged clamp), `TOOLBAR_SELECT_CLASS`, `PILE_STEP_FRACTION`, `placeholderMeta`, the group/sort/pile effects (`:304-383`), the metadata lookup (`:389-466`, where `metadataLoaded` differs on `size === 0`) and the renderer (`:753-890`).<br><br>**A layering break the wall doesn't catch:** it reads 5 selectors (`:216-250`) and dispatches `zoneViewCleared` / `incomingRevealDismissed` from the component (`:530-546`). The idiom is `hooks/dialogs/useZoneDialogActions.ts:68`.<br><br>The lent-drag policy `canDragLent` is inline (`:262-286`). `zoneLabel` (`:142`) duplicates `useZoneViewDialog.ts:27`. The spec has 4 tests; untested: the lent-drag gate, grouping, persistence, and the `liveCards` fallback. | <ul><li>`dialogs/IncomingRevealDialog/useIncomingReveal.ts` (selectors, close, `canDragLent`)</li><li>render through the shared modules above</li><li>import the zone-label map</li><li>Result ≈ 200 lines.</li><li>Idiom: `useZoneViewDialog.ts` + `useZoneDialogActions.ts`.</li></ul> | M | Same as ZoneViewPanel: 25b, 29, 30 and 32 would otherwise each be done twice (three times counting ZoneRevealPanel). |
| `cardCatalog.ts` | 1032 | refactor | **One purpose, four layers:**<ul><li>Dexie mapper (`:428-545`, `:654-700`);</li><li>Scryfall cache repo (`:560-620`);</li><li>Scryfall HTTP client (`fetchScryfall` `:761`, 75-chunk `batchFetchScryfall` `:806-905`, `fetchAllPrintings` `:907`);</li><li>merge/orchestration (`:161-425`).</li></ul>The real problem is that Scryfall access is spread around the tree (D4/D5). `HandZone` / `StackColumn` call `lookupCard` from components. The spec has 14 tests. Untested: set+collector mismatch fallback, split-card first-face key, NFC normalisation, non-ok batch warn. | <ul><li>`services/scryfall/client.ts`: fetch, batch, printings, detail. This becomes the one Scryfall client.</li><li>`services/cards/catalog/{scryfallCache,dexieCardMapper,lookup}.ts`, with `index.ts` exports unchanged.</li><li>Features adapt from the client.</li><li>Idiom: Stage 1's `cardLookup` → `services/cards` lift.</li></ul> | M | 31 touches `decks/search.ts` (quick-add), so leave that caller out of a first pass. No game PR conflicts. |
| `TopBar.tsx` | 860 | refactor | **A layout view that owns four state models:**<ul><li>a sticky-tab store: module singleton + `useSyncExternalStore` + `localStorage` (`:733-830`);</li><li>last-route persistence, which `AppShell` imports from this view (`:835-860`);</li><li>identity-change detection with its own storage key (`:181-212`);</li><li>deck-name enrichment (`:216-247`).</li></ul>Also:<ul><li>`localStorage` is called directly 10× although `services/storage/StorageService.ts` exists.</li><li>The sticky predicate (`:125`/`:335`) and the `deck:(\d+)` parse (`:236`/`:300`) each appear twice.</li><li>It carries the 4th copy of the backend deck-list fetch and flatten (D6).</li><li>`UserMenu` (`:512-630`) is a hand-rolled dropdown with no menu semantics.</li><li>Untested: sticky persist/restore, `isValidPersistedTab`, `detectTransientTab`.</li></ul> | <ul><li>`layout/stickyTabsStore.ts` + `useStickyTabs.ts` (via StorageService)</li><li>`layout/lastRoute.ts`</li><li>`layout/useIdentityChange.ts`</li><li>`layout/topBarTabs.ts` (pure, specced)</li><li>`UserMenu.tsx`, `TabList.tsx`</li><li>shared `W/hooks/useBackendDeckList.ts`</li><li>Idiom: parity-09 hooks + pure modules.</li></ul> | M | None of the game PRs. 31 overlaps only through the shared deck-list hook (`decks/hooks/useDeckList.ts`). |
| `messageLog.ts` | 857 | refactor | **One cohesive job (event → log entry) in the wrong layer.**<ul><li>Every `format*` builds finished English sentences with the `L` tag (`:92`), using English tables: zone labels `:133`, `PHASE_NAMES` `:146`, `COUNTER_DISPLAY_NAME` `:448`, `'The server'` / `Player N` `:124`.</li><li>These sentences are frozen into `game.messages`, so webatrice i18n cannot translate them.</li><li>`classifyLogTone` (`:835-857`) colours lines by regex over the English text, called from `ChatLog.tsx:171`.</li><li>The reducer clock is impure: `eventTimestamp()` calls `Date.now()` (`game.reducer.helpers.ts:35`).</li><li>There are two log entry points: reducers calling `pushEventMessage` (`game.reducer.chat.ts`, `.card.ts:320`, `.lifecycle.ts`) and listeners dispatching `gameMessageAppended`.</li><li>`formatLeaveMessage` exists twice; the `messageLog.ts:694` copy is dead outside its spec.</li><li>There are three player-name fallbacks (`Player N` / `'Unknown player'` / `undefined`).</li></ul> | <ul><li>Formatters return structured descriptors `{ kind, params }` (ids, names, zones, positions; no sentences).</li><li>`LogEntry` gains `kind`, which replaces `classifyLogTone`.</li><li>Time arrives as an action payload, so the reducer is pure.</li><li>Rendering to translated text moves to `G/components/ChatLog/` beside `useGameLog.ts`, with i18n keys.</li><li>One fallback, one `formatLeaveMessage`.</li><li>Idiom: datatrice returns data, webatrice owns strings (datatrice instructions); `game.reducer.helpers.ts` for pure helpers.</li></ul> | M–L | **32 is blocked in substance.** About 150 log sentences live in datatrice, so 32 cannot reach them without this. 29: the life-change live region should key on `kind`, not English regexes. 25b: "game time in logs" changes the same timestamp/payload path. |
| `game.listeners.ts` | 1057 | refactor | **One function registers 18 listeners. The design is sound** (no-op event reducers → primitive actions + log), but:<ul><li>`cardMoved` (`:50-432`) is 380 lines doing six jobs: identity, optimistic bookkeeping (`:201-305`), zone-view sync, an orphan-arrow sweep (`:368-397`, a pure state scan), attachment reparenting and the log line.</li><li>Pure planning is inlined: the attribute → fields switch, the counter merge, the resync carry-forward, the token constructor.</li><li>It mixes two styles: listener-applies vs reducer-applies (`cardFlipped`, `counterSet`, …).</li></ul>No transport calls and no webatrice imports. There is no `game.listeners.spec.ts`. Untested: optimistic skip + id migration, undo-draw (both paths), replay early-return in `cardsRevealed`, `drawBeaconBumped`. | <ul><li>`game.listeners.{card,move,reveal,turn,player}.ts`, each exporting `registerXListeners(mw)`; `game.listeners.ts` becomes the barrel.</li><li>`arrowsTouchingCard` becomes a selector.</li><li>Planners move to `game.reducer.helpers.ts`.</li><li>Idiom: `game.reducer.<domain>.ts` spread in `game.reducer.ts:21-28`; size target `rooms/rooms.listeners.ts` (133).</li></ul> | M | 25b: the arrow lifetime in subphases touches the sweep `:368` and the `activePhaseSet` listener `:977`. The log lines change with the messageLog descriptors. Otherwise this is only textual. |
| `GameLobby.tsx` | 827 | refactor | **Five jobs in one component:**<ul><li>deck-list fetch (`:144`);</li><li>module-level summary cache + in-flight download loop + `DECK_DOWNLOADED` → `parseCod` (`:131-233`);</li><li>grouping/sort policy (`:93-111`, `:240-274`);</li><li>`.cod` upload via `FileReader` (`:291-312`);</li><li>inline `PlayerRow` / `BracketBadge` / empty seats.</li></ul>Also:<ul><li>`kickFromGame` is called from an inline JSX onClick (`:443`).</li><li>`flattenDecks` (`:69`) duplicates `useOpenDeckInEditor.ts:17`.</li><li>`isValidCod` (`:796`) duplicates `useDeckSelectDialog.ts:31`.</li><li>`BRACKET_TONE` (`:809`) copies `features/decks/bracketTone.ts`; the comment admits it, and the boundary blocks reuse.</li><li>Many literals.</li><li>The spec has 22 tests. Untested: grouping, summary download/dedupe/malformed, invalid upload, kick, bracket badge.</li></ul> | <ul><li>`G/hooks/useLobbyDeckSummaries.ts`</li><li>`G/hooks/useLobbyDeckSelect.ts` (pick, upload, force start, kick)</li><li>`G/components/lobby/lobbyDeckGrouping.ts` (pure, specced)</li><li>`lobby/PlayerRow.tsx`, `lobby/EmptySeat.tsx`</li><li>`.cod` validation exported from `services/decks/cockatriceDeckDocument.ts`</li><li>bracket tone moved to `services/decks/` or `types/`</li><li>deck list from the shared `useBackendDeckList`</li><li>Idiom: parity-09 `Decks.tsx` façade.</li></ul> | M | 32 directly, since GameLobby's literals are in its scope. 29/30: `PlayerRow` buttons. |
| `BattlefieldCardMenu.tsx` | 707 | refactor | Layering is clean (ports only), but the whole menu is a ≈650-line inline function (`:44-705`) mixing three jobs:<ul><li>target resolution, written three times (`:66`, `:252`, `:556`);</li><li>batch maths: `dispatchPTDelta` `:287`, reset P/T `:506`, clone `:384`, reduce-life `:555`, add counter `:649`;</li><li>item wiring.</li></ul>The opponent menu (`:75-233`) is a hand-built `CardMenuItem[]` that bypasses `buildCardContextMenu`, making it a second menu definition. The spec has 3 tests for ≈30 handlers. | <ul><li>`ui/PlayerBoard/battlefieldSelectionOps.ts` (pure: `resolveTargets`, `ptDeltaEntries`, `resetPTEntries`, `incCounterEntries`, `totalPower`, `cloneParams`)</li><li>`ui/PlayerBoard/useBattlefieldCardOps.ts` (binds the ops to the ports)</li><li>`buildOpponentCardMenu` in `cardContextMenu.model.ts`</li><li>The component maps ops onto the model.</li><li>Idiom: `cardContextMenu.model.ts`, `hooks/seatDropPlan.ts`.</li></ul> | M | 17a/17b (menu items), 17c (needs the ops), 30 (Menu primitive), 32 (labels). |
| `useSeatShortcutOperations.ts` | 679 | refactor | **A near-copy of the menu handlers:** resetPT, reduceLifeByPower, P/T delta, add counter, clone, flip/peek/unattach/doesntUntap/attach/arrow/annotation/moves, each mirroring `BattlefieldCardMenu`.<ul><li>Comments point at dead `PlayerBox` line numbers.</li><li>The "selection is on the battlefield" check is repeated 20×.</li><li>It takes 28 positional args (`:23-50`), i.e. the seat context flattened.</li><li>8 tests cover 17 of 46 action ids.</li></ul> | <ul><li>A table `ActionId → useBattlefieldCardOps(selection).x` with no logic of its own.</li><li>Take the seat context, not 28 args.</li><li>Idiom: `SEAT_SHORTCUT_ACTIONS` + `useShortcutGroup` (Stage 3).</li></ul> | S once the ops exist | **17c** turns this file into the catalogue ("each ActionId calls an existing seat op"). 25b: selection counts. |
| `useGameArrowInteractions.ts` | 627 | refactor | **A layering violation the wall misses:** it calls `webClient.request.game.createArrow` (`:296`, `:308`, `:497`, `:511`, `:589`), `attachCard` (`:460`) and `bulkTap` (`:546`) directly, building wire params inline. That bypasses `usePlayerTargetCommands.ts:38-76`, which owns attach/arrow.<br><br>**Two pending-target state machines:**<ul><li>this hook's `pending` + Escape (`:125-148`, gated by sniffing `.MuiDialog-root`);</li><li>`PlayerBoard/usePendingArrows.ts` with its own Escape handler.</li></ul>The menu's "Draw arrow" uses one and right-drag uses the other. "Play then arrow" is written twice (`:280-310` / `:480-515`); the game instructions file admits "both must stay in sync". It also mixes DOM hit-testing with protocol and with double-click play routing. The spec (28 tests) is decent. | <ul><li>`hooks/arrowResolution.ts` (pure: source + target → play+arrow / arrow / attach)</li><li>`hooks/useArrowDrag.ts` (pointer + hit-test only)</li><li>a game-level target port: `PlayerTargetCommands` gains judge wrapping and arrow colour</li><li>one pending owner (fold in `usePendingArrows`)</li><li>double-click play goes to the card port</li><li>Idiom: `seatDropPlan.ts` → `useMoveCard` (plan pure, send through one port).</li></ul> | L | 30: the keyboard target picker for arrow/attach (G10) needs exactly one pending owner. 17c: drawArrow / removeLocalArrows shortcuts. 25b: arrow lifetime. |
| `BattlefieldSidebar.tsx` | 668 | fine (2 extractions) | The right rail (preview, PlayerList, ChatLog, invite, concede/leave) is a cohesive composition. Leave and concede go through `useGameDialogActions`.<br><br>But:<ul><li>it holds a private Scryfall detail fetch + `ScryfallDetail` type (`:70-121`), copy #3 (D4);</li><li>preview-mode `localStorage` (`:48-66`, `:140-157`) and the related-card back/forward stack (`:159-200`) sit inline;</li><li>`PreviewMode` is exported from the component file and imported by 3 popup files;</li><li>no spec;</li><li>mixed `t()` and literals.</li></ul> | <ul><li>The detail fetch moves to the shared Scryfall client.</li><li>`BattlefieldSidebar/useCardPreviewDetail.ts` (mode persistence, related stack, fetch state).</li><li>`PreviewMode` → `CardPreviewPopup/cardPreviewChannel.ts`.</li><li>Idiom: `hooks/useScryfallCard.ts`.</li></ul> | S | 32 (literals). 29 only through ChatLog's live region (not this file). |
| `cockatriceDeckDocument.ts` | 502 | fine | A pure `.cod` codec with metadata already split out; `deckImport` / `deckExport` delegate to it. No other `.cod` parser exists in datatrice or sockatrice.<br><br>Gaps:<ul><li>bracket read/write (`:404-500`) has no spec;</li><li>**`<sideboard_plan>` is neither read nor preserved.** `lobby/deckViewModel.ts:95` parses it with its own DOMParser, so a desktop deck re-saved through `serializeCod` probably loses its plans (unverified; worth one round-trip test).</li></ul> | Optional:<ul><li>export `validateCod()` (absorbs D6's two validators);</li><li>export `readSideboardPlans()` and make `deckViewModel` use it.</li></ul> | S | None. |
| `_Countries.ts` | 505 | fine | Data table: about 250 flag SVG imports plus one export object, no logic. | Could be generated, but there is no need. | — | None. |

## 3. Duplicate implementations

### Known (PR 30 owns them; confirmed only)

- **The two game menu stacks:**
  - **Stack A** is the MUI one:
    - `Game.tsx:15-17` renders `CardContextMenu` / `HandContextMenu` / `ZoneContextMenu` from `useGameDialogState.cardMenu`;
    - `CardContextMenu.tsx:3-4` uses `@mui/material/Menu`;
    - its hooks call `webClient` directly, judge-wrapped: `useCardContextMenu.ts:87,124-230`, `useZoneContextMenu.ts:52-87`, `useHandContextMenu.ts:56,68`.
  - **Stack B** is the seat menus (`SeatCardMenus/*` via `CardMenuPopup`; region hooks via `context-menus/ContextMenu/ContextMenu.tsx:110`), which go through the ports.
  - That gives two item types (`CardMenuItem`, `ContextMenuItem`) and two renderers.
  - B should win. A's judge wrapping must move into the ports first.
- **The orphaned `ui/CardSlot/CardSlot.tsx`:** nothing outside its folder imports it.
  - `ui/CardSlot/counterColors.ts` **is live**: `SeatCard.tsx:4`, `CardContextMenu.tsx:13` and `cardContextMenu.model.ts:9` use it.
  - Deleting CardSlot must therefore move `counterColors.ts`, not delete it.
- **The duplicated library menu:** `ZoneStack.tsx:267-930` vs `useLibraryMenuItems.ts:190-474`. The shortcut hints have already drifted (table row 1).

### New

| # | Concept | Locations | Winner and why | Effort | Planned PR |
|---|---|---|---|---|---|
| D1 | Card operations, three copies | `BattlefieldCardMenu.tsx`, `useSeatShortcutOperations.ts`, stack A `useCardContextMenu.ts` (`applyPTDelta` / `parsePT` / `MAX_COUNTER_VALUE` used directly in all three, plus `useBattlefieldMenuItems`) | A new `battlefieldSelectionOps` + `useBattlefieldCardOps` | M | 17c, 30 |
| D2 | Arrow/attach sending and pending state | `useGameArrowInteractions.ts` (direct `webClient`) vs `usePendingArrows.ts` → `usePlayerTargetCommands` | The port path | L | 30 (G10), 17c |
| D3 | Floating panel geometry (storage/clamp/drag), `TOOLBAR_SELECT_CLASS`, `PILE_STEP_FRACTION`, `placeholderMeta`, group/sort/pile prefs, catalog-meta effect, pile/grid renderer | `ZoneViewPanel.tsx:44-142,198,225-316,608-647,838-1000`; `IncomingRevealDialog.tsx:22,55-141,166,304-383,389-466,753-890`; `ZoneRevealPanel.tsx:78-165` | A new shared `dialogs/shared/*`; no copy is canonical (the clamp has diverged) | M | 25b, 29, 30 |
| D4 | Scryfall card-detail fetch + `ScryfallDetail` | `decks/cardDetail.ts:12,69`; `BigCardPreview.tsx:21,50`; `BattlefieldSidebar.tsx:70,99` | `cardDetail.ts`, the only named, exported policy, lifted to `services/` | S | none |
| D5 | Scryfall HTTP + image URLs | 75-chunk batching in `cardCatalog.ts:806` and `decks/pricing.ts:96,276`; direct calls in `bracketSources.ts` and `search.ts`; image URLs built inline in `SeatCard.tsx:87`, `ZoneStack.tsx:107`, `deckCardImageUrl.ts:11`, `BattlefieldSidebar.tsx:293`, `CardPreviewPopupPage.tsx:90`, `BigCardPreview.tsx:105`, `decks/hydrate.ts:100`, `decks/deckSummary.ts:92`, `cardCatalog.ts:649` | `services/ScryfallService.ts` (`getScryfallUrl*`) + one client. All image URLs must change in one commit, because `deckCardImageUrl` relies on byte-equal URLs for cache hits | M | 31 (`search.ts` only) |
| D6 | Backend deck-list fetch / flatten / `.cod` validation | fetch: `TopBar.tsx:162`, `GameLobby.tsx:146`, `useOpenDeckInEditor.ts:57`, `decks/hooks/useDeckList.ts:148`; flatten: `GameLobby.tsx:69`, `useOpenDeckInEditor.ts:17`, `TopBar.tsx:711`; validate: `GameLobby.tsx:796`, `useDeckSelectDialog.ts:31`, `deckViewModel.ts:69` | A shared `W/hooks/useBackendDeckList.ts` + `validateCod` in the codec | S–M | 31 (`useDeckList`), 32 (GameLobby) |
| D7 | ManaSymbols components (known follow-up from parity-09) | `G/components/ui/ManaSymbols/ManaSymbols.tsx:16,32,54` (hard-codes the svgs URL) vs `decks/components/ManaSymbols.tsx` + `decks/manaSymbols.ts:30` | The deck pair, moved to `@app/components` | S | 31, 32 (callers) |
| D8 | Zone label maps | `useZoneViewDialog.ts:27` (Title case, raw `'rfg'`), `IncomingRevealDialog.tsx:142` (lower case), `ZoneViewDialog.tsx:37` (keyed by `ZoneName`) | The `ZoneName`-keyed map, with i18n keys | S | 32 |
| D9 | Phase names | `PhaseTrack.tsx:65-90` vs `D/store/games/messageLog.ts:146` | One i18n key set in webatrice (after the messageLog descriptors) | S | 32 |
| D10 | Dialog frames | `DialogShell` (18 users), `decks/dialogs/DeckDialogFrame` (13) + `decks/hooks/useEscapeKey` (12), hand-rolled portals (`FilterGamesDialog.tsx:60`, `GameInfoDialog.tsx:38`, `MoveTopUntilDialog.tsx:28`, `PlayerListDialogs.tsx:43`), MUI `Dialog` (`ShutdownDialog`, `TemporaryPasswordDialog`, `CreateGameDialog`, `ReplayShareCodeDialog`, `CardImportDialog`) | `DialogShell` | L | 31 (deck), 29/30 (game). **No owner:** `FilterGamesDialog`, the five MUI dialogs, and `PlayerListDialogs` unless 29/30 take it |
| D11 | Menus | `context-menus/ContextMenu`, MUI in stack A, `UserDisplay/UserActionsMenu.tsx:102`, `PlayerList/PlayerListContextMenu.tsx:208`, `decks/.../DeckRowActionsMenu.tsx:120`, `TopBar` `UserMenu` | PR 26 `components/Menu` (not in this base) | L | 30 (game), 31 (DeckRowActionsMenu). **No owner:** `UserActionsMenu`, TopBar `UserMenu` |
| D12 | Keyboard list navigation | `W/hooks/useGridRows.ts:30` vs `feature-widgets/card-import/listKeyboard.ts:9` | `useGridRows` (add PageUp/PageDown) | S | none |
| D13 | Small duplicates | <ul><li>`deckColorIdentity`: `deckPersistence.ts:36` vs `deckSharing.ts:139` (case differs)</li><li>`DECK_ZONE_MAIN/SIDE`: `types/cockatriceDeck.ts:21` vs `lobby/deckViewModel.ts:14`</li><li>`BRACKET_TONE`: `GameLobby.tsx:809` vs `decks/bracketTone.ts`</li><li>`formatLeaveMessage`: `D/…/game.reducer.helpers.ts:23` vs dead `messageLog.ts:694`</li><li>`yyyy-MM-dd HH:mm`: `reports/reportFormat.ts:14` vs `developer/serverStatsRows.ts:50`</li><li>types `HandSortKey` (`useHandContextMenu.ts:3` / `gameDialogs.types.ts:263`), `ModerationNotice`, `LoginFormValues` (hand-written vs zod)</li><li>selection-glow box-shadow literal at 6 sites (`ZoneViewPanel` ×2, `HandZone:323`, `StackColumn:175`, `Battlefield:436`)</li></ul> | Each side named first, except: `formatLeaveMessage` in messageLog; types in the types/zod file; the glow becomes a `SeatCard` token | S each | 32 (HandSortKey, BRACKET_TONE via GameLobby) |

Checked and not duplicated:

- wire zone names: only `sockatrice/zoneNames.ts`;
- counter palette: only `counterColorForId`;
- VirtualList;
- the player model (`PlayerEntry`);
- the type-line row policy (the split is intentional and named);
- `formatBytes` ×2 (a name clash, but different policies).

## 4. Proposed refactor PRs (at most 3, in merge order)

The planned order this assumes is 17a/17b → 17c → 25b → 29 → 30 → 31 → 32. 31 is independent of game.

**R1: `refactor(game): one card-ops and targeting seam` (after 17a/17b, before 17c). L.**

- `battlefieldSelectionOps.ts` (pure, table specs) + `useBattlefieldCardOps.ts`. `BattlefieldCardMenu` and `useSeatShortcutOperations` both call these:
  - the shortcut hook becomes a table with seat-context input;
  - `buildOpponentCardMenu` joins the model.
- `PlayerTargetCommands` gains judge wrapping and arrow colour. `arrowResolution.ts` (pure) + `useArrowDrag.ts`. One pending-target owner, with `usePendingArrows` folded in. `useGameArrowInteractions` stops calling `webClient`.
- Characterization first: pin the request shapes of all 46 seat action ids and both arrow paths before moving anything, in the Stage-1 style.
- Why here:
  - 17c's rule ("each ActionId calls an existing seat op") becomes a table entry instead of a third copy;
  - 30's G10 keyboard target picker and G4 stack-A deletion both need one port path with judge wrapping.
- Conflicts:
  - it lands on 17b's menu items, so rebase after 17b;
  - 25b touches arrow lifetime in datatrice, not this hook, so the clash is textual only.

**R2: `refactor(game): share the zone-view dialog family` (after 25b, before 29). M.**

- Contents:
  - `dialogs/shared/{useFloatingPanelGeometry,useZoneViewPreferences,useCardCatalogMeta}.ts` + `ZoneCardGroups.tsx` / `ZoneCardCell`;
  - `ZoneViewPanel`, `IncomingRevealDialog` and `ZoneRevealPanel` move onto them;
  - `useIncomingReveal.ts` takes the selectors and dispatches out of the component;
  - one `ZoneName`-keyed label map (D8);
  - the marquee reuses `useSeatMarquee`.
- Optionally fold in the ZoneStack library-menu de-dup (≈ −660 lines, S) if 30 has not started. Otherwise leave it with 30, as tasked.
- Why here:
  - 25b adds zone-view search autofocus and group/sort prefs to `ZoneViewPanel`; land those first and lift them once;
  - 29 (G13/G14 DialogShell) and 30 (roving focus over one cell) then edit one module instead of three copies.
- Conflicts: 25b textual (hence after it). If 29's base already includes 25b, R2 slots directly onto that base.

**R3: `refactor(datatrice,game): structured game-log entries and the lobby split` (after 30 and 25b, before 32). M–L.**

- `messageLog.ts` formatters return `{ kind, params }` descriptors. `LogEntry.kind` replaces `classifyLogTone`. The timestamp becomes an action payload (pure reducer). One `formatLeaveMessage`, one player-name fallback.
- webatrice `ChatLog` renders descriptors through i18n keys, sharing phase names with `PhaseTrack` (D9).
- `D/` changeset is **minor**: `LogEntry` gains optional `kind` and descriptor fields, and `text` stays for one release so replay/log consumers keep working.
- In the same PR, the GameLobby split:
  - `useLobbyDeckSummaries`, `useLobbyDeckSelect`, `lobbyDeckGrouping.ts`, `PlayerRow` / `EmptySeat`;
  - kick moves out of JSX;
  - shared `useBackendDeckList` + codec `validateCod` (D6);
  - bracket tone moves to a root owner.
- Why here:
  - 32 cannot translate the ≈150 log sentences frozen in datatrice, and GameLobby's literals sit in a god component;
  - 29's live region keys more safely on `kind`, but 29 lands earlier, so R3 must keep 29's announcements green, i.e. re-key them onto `kind` here;
  - 25b's game-time change edits the same timestamp path, so land after it.
- Conflicts:
  - 25b (timestamp), 29 (live region), 30 (`PlayerRow` buttons): land after all three;
  - 32 rebases onto R3.

### Not scheduled (no planned-PR conflict; can go any time)

- The `services/scryfall` client + `cardCatalog` layer split + D4/D5. M. Exclude `decks/search.ts` until 31 merges.
- The TopBar split (sticky tabs, last route, `UserMenu`). M.
- The `game.listeners` per-domain split. M. Better after 25b, which touches the arrow sweep.
- Small duplicates: D7, D12, D13, the `counterColors.ts` move when CardSlot goes, and a `<sideboard_plan>` round-trip test for `serializeCod`.
- Dialog/menu stragglers with no owning PR: `FilterGamesDialog`, the five MUI dialogs, `UserActionsMenu`, TopBar `UserMenu`.
