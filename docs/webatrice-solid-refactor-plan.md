# Webatrice single-responsibility and dependency-boundary refactor plan

Status: proposal only; no production, test, configuration, generated, Datatrice, or Sockatrice code is changed by this review.

Review basis: current checkout at `cfdf276368f6663db71a952665fafb0adee307ec` on 2026-08-24. The required orientation documents were read in full and then checked against current source. Approximate line ranges below refer to this checkout and are intended to identify symbols, not to be permanent documentation anchors.

Evidence labels used throughout:

- **Confirmed** — directly established by current source, a scoped repository search, an existing test, or a diagnostic run in this checkout.
- **Inferred** — the most likely design conclusion from confirmed evidence, but not itself an executed behavior or authoritative contract.
- **Unverified** — evidence is incomplete or the cited upstream Cockatrice implementation is not present in the reviewed scope.
- **Missing** — a named artifact or coverage area was not found after a stated scoped search.

Proposed paths marked **new** do not exist yet by definition. Every link to current evidence resolves in this checkout.

## 1. Executive summary and priorities

### Conclusion

`PlayerBox.tsx` is not merely large. It has at least twelve independent reasons to change: player presentation, zone presentation, battlefield pixel layout, wire-coordinate mapping, metadata lookup, menus, prompts and dialogs, selection, drag/drop, global browser-event handling, command workflows, and Cockatrice-parity notes. It also duplicates a second, already-structured game interaction stack that remains mounted by `Game.tsx`. This makes changes risky because behavior ownership is ambiguous, tests mostly exercise the older owners, and the current seat surface does not have a direct component/interaction suite. **Confirmed:** [PlayerBox.tsx](../packages/webatrice/src/features/game/components/PlayerBox/PlayerBox.tsx#L72) is 11,058 lines; [Game.tsx](../packages/webatrice/src/features/game/Game.tsx#L160) mounts the existing DnD, menu, dialog, selection, preview, and arrow infrastructure while [GameBoardCell.tsx](../packages/webatrice/src/features/game/components/ui/GameBoardCell/GameBoardCell.tsx#L1799) renders `PlayerBox` with a separate flat command surface.

The desired end state is not a collection of arbitrarily small files. It is one state adapter, one command boundary, and one owner for each interaction or view:

1. `GameBoardCell` selects Datatrice state and creates grouped command ports using `useWebClient()`.
2. `PlayerBoard` composes presentational zone and battlefield components from a typed view model.
3. The existing `Battlefield`, `CardContextMenu`, `ZoneViewDialog`, `useGameDnd`, `useGameSelection`, and `useGameDialogs` modules own their respective behavior.
4. Root card/deck services own browser card-catalog and Cockatrice deck-document capabilities shared by the deck and game features.
5. `feature-wrappers/layout` owns `TopBar` and shell-tab behavior; feature-specific cache work is injected through a narrow lifecycle port.

Datatrice remains the only owner of normalized live game state. Sockatrice remains the only owner of transport and protocol commands. The proposal moves Webatrice code around those owners; it does not replace them.

### Prioritized recommendations

| Priority | Recommendation | Why first | Change class | Evidence |
|---|---|---|---|---|
| P0 | Add a characterization barrier around the current `PlayerBox` seat surface before moving stateful code. | The current component has global listeners, portals, hidden-zone sentinels, cross-player routing, and gesture thresholds, but no directly named `PlayerBox` or `GameBoardCell` spec was found. Existing game orchestration and drag suites are skipped and claim replacement coverage that is absent. | Behavior characterization; no ownership change | **Confirmed / Missing:** scoped search under `packages/webatrice/src`, `packages/webatrice/integration`, and `packages/webatrice/e2e`; [Game.dragdrop.spec.tsx](../packages/webatrice/src/features/game/Game.dragdrop.spec.tsx#L1), [Game.orchestration.spec.tsx](../packages/webatrice/src/features/game/Game.orchestration.spec.tsx#L1), [Game.spec.tsx](../packages/webatrice/src/features/game/Game.spec.tsx#L103). |
| P1 | Remove live cross-feature imports by lifting the shared card catalog and Cockatrice deck-document model to narrow root owners. | `game` imports `decks` internals for lookup, parsing, and format types. This violates the declared feature rule even though the current boundary configuration groups every feature into one undifferentiated element. | File movement plus public API split; no game-state relocation | **Confirmed:** [PlayerBox.tsx](../packages/webatrice/src/features/game/components/PlayerBox/PlayerBox.tsx#L65), [IncomingRevealDialog.tsx](../packages/webatrice/src/features/game/components/PlayerBox/IncomingRevealDialog.tsx#L21), [LibrarySearchDialog.tsx](../packages/webatrice/src/features/game/components/PlayerBox/LibrarySearchDialog.tsx#L15), [GameBoardCell.tsx](../packages/webatrice/src/features/game/components/ui/GameBoardCell/GameBoardCell.tsx#L37), [GameLobby.tsx](../packages/webatrice/src/features/game/GameLobby.tsx#L23). |
| P1 | Move `TopBar` into page chrome and invert its deck-cache dependency. | The current file produces three live `boundaries/dependencies` errors because root `components` imports game/deck features. It also mixes shell view, route derivation, browser persistence, and feature cleanup. | File movement, narrow hooks, and dependency inversion | **Confirmed:** [TopBar.tsx](../packages/webatrice/src/components/layout/TopBar.tsx#L10), [eslint.boundaries.mjs](../packages/webatrice/eslint.boundaries.mjs#L30). A scoped ESLint run reported dependency errors at lines 10, 11, and 20. |
| P1 | Introduce `PlayerBoardModel` and grouped `PlayerBoardCommands`; make `GameBoardCell` the adapter. | This creates a seam before any `PlayerBox` extraction and keeps selectors/optimistic updates/protocol calls out of presentation. | New interface; dependency inversion; no server-state relocation | **Confirmed:** `PlayerBoxProps` spans approximately lines 956–1340; [GameBoardCell.tsx](../packages/webatrice/src/features/game/components/ui/GameBoardCell/GameBoardCell.tsx#L1805) passes roughly forty callbacks. |
| P2 | Extract pure placement, layout, menu-model, expression, and zone-sort policies, preserving current outputs byte-for-byte. | Pure logic is the lowest-risk part of the monolith and supplies testable contracts for later UI movement. | Simple extraction or consolidation; no state relocation | **Confirmed:** [PlayerBox.tsx](../packages/webatrice/src/features/game/components/PlayerBox/PlayerBox.tsx#L223) contains these pure functions; the existing [gridMath.ts](../packages/webatrice/src/features/game/components/battlefield/Battlefield/gridMath.ts#L1) already declares itself the battlefield-grid source. |
| P2 | Consolidate `PlayerBox` selection, DnD, menus, dialogs, preview, and arrows into the already-mounted game infrastructure one subsystem at a time. | Two live infrastructures currently disagree about ownership. Compatibility façades allow one route at a time to switch without a flag-day rewrite. | Local UI-state relocation and lifecycle change; requires characterization | **Confirmed:** [Game.tsx](../packages/webatrice/src/features/game/Game.tsx#L163) mounts the structured providers; `PlayerBox` independently installs document/window handlers and renders portals from approximately lines 3432–4767 and 9261–11033. |
| P3 | Replace the `PlayerBox` render shell with the existing `PlayerBoard`, then remove legacy mock and imperative shims. | This is safe only after commands and interactions have converged. `receiveBattlefieldCards` is already a no-op with no caller, while real zones are sourced from Redux. | Final façade removal; deletion after proof | **Confirmed:** [PlayerBoard.tsx](../packages/webatrice/src/features/game/components/ui/PlayerBoard/PlayerBoard.tsx#L12), [PlayerBox.tsx](../packages/webatrice/src/features/game/components/PlayerBox/PlayerBox.tsx#L5539), [mockDeckStore.ts](../packages/webatrice/src/features/game/mockDeckStore.ts#L1). |
| P3 | Apply the same responsibility test to `DeckEditor`, `Decks`, and `useGameDialogs` behind stable façades. | These are confirmed hotspots but are less dangerous than the active game-seat split. | Component/hook extraction; local UI-state organization | **Confirmed:** current files are 2,552, 1,625, and 1,521 lines respectively and contain the distinct symbol groups listed in section 3. |

## 2. Current ownership and dependency rules

### Declared ownership

| Owner | Must own | Must not absorb | Current evidence |
|---|---|---|---|
| Webatrice | React composition, browser UI effects, browser persistence, presentation models, interaction policy, and use of the client through `useWebClient()`. | Normalized server/room/game state or a second transport/protocol implementation. | **Confirmed:** [webatrice.instructions.md](../.github/instructions/webatrice.instructions.md), [agent-onboarding.md](agent-onboarding.md), and current hooks such as [useGameDnd.ts](../packages/webatrice/src/features/game/hooks/useGameDnd.ts#L227). |
| Datatrice | Normalized server, room, game, player, zone, and card state and React selectors/hooks around that state. | Web-specific layout, portals, localStorage, or component state. | **Confirmed:** required architecture documents and current selectors in [GameBoardCell.tsx](../packages/webatrice/src/features/game/components/ui/GameBoardCell/GameBoardCell.tsx#L329). |
| Sockatrice | `WebClient`, protobuf/generated command shapes, transport, response correlation, and protocol semantics. | React ownership or duplicated Webatrice state. | **Confirmed:** imports and request calls in [GameBoardCell.tsx](../packages/webatrice/src/features/game/components/ui/GameBoardCell/GameBoardCell.tsx#L771) and [useGameDnd.ts](../packages/webatrice/src/features/game/hooks/useGameDnd.ts#L211). |

### Internal dependency direction

The current boundary file defines root elements for `components`, `dialogs`, `feature-widgets`, `feature-wrappers`, `features`, `hooks`, `services`, `store`, `types`, and `utils`. Features may consume root owners, feature widgets, and page wrappers; page wrappers may consume root owners and feature widgets; root components may not consume features. **Confirmed:** [eslint.boundaries.mjs](../packages/webatrice/eslint.boundaries.mjs#L3) and its allow rules at [lines 19–60](../packages/webatrice/eslint.boundaries.mjs#L19).

The architectural prose is stricter than the executable rule: one feature must not import another feature’s internals. The configured element pattern is the single type `features` for all `src/features/**`, and the feature allow-list omits `features`; however, imports from one feature to another resolve as the same element type and were not reported by the scoped ESLint run, while `components` → `features` imports were. **Confirmed:** current configuration and diagnostic behavior. The exact `eslint-plugin-boundaries` capture syntax needed to distinguish feature names has not been verified in this review; that enforcement improvement is therefore **Unverified** and is an implementation-phase spike, not a precondition for correcting the imports.

### Dependency rules for the proposed design

1. `GameBoardCell` and game hooks may import Datatrice selectors, Sockatrice types, and `useWebClient()` because they are feature adapters coordinating UI actions.
2. `PlayerBoard` and leaf views receive Webatrice presentation models and grouped command ports; they do not select normalized state or construct protocol payloads.
3. Root `services/cards` may use the existing root Dexie service and external fetch APIs. It exposes card-catalog results and does not import a feature.
4. Root `services/decks` may parse/serialize Cockatrice deck documents and import dependency-free root deck-document types. Deck editor state stays in `features/decks`.
5. `feature-wrappers/layout` owns shell chrome. It receives a feature lifecycle port from `AppShell`; it does not import deck or game internals.
6. Shared multi-feature UI remains in `feature-widgets`; pure browser/data capabilities remain narrow root services or hooks rather than being forced into a widget.
7. No new `helpers.ts`, `common.ts`, or generic `utils.ts` is proposed. Every new module below has one named policy or adapter.

## 3. Repository-wide responsibility hotspots

Line count is included as orientation, not as the finding. Each row identifies distinct dependencies or reasons to change.

| Hotspot | Confirmed responsibility mixture | Ownership problem and recommendation | Change class | Evidence |
|---|---|---|---|---|
| `features/game/components/PlayerBox/PlayerBox.tsx` (11,058 lines) | View models; zone/wire mapping; card-menu model and renderer; nine modal implementations; selection; shortcuts; pointer and global events; hit testing; DnD; optimistic move coordination; battlefield/zone layout; Scryfall/Dexie lookup; all seat markup; parity commentary. | Converge into the existing game owners through a `PlayerBoard` façade. Detailed in sections 4–9. | Pure moves, new model/command interface, local-state relocation, behavior characterization. | **Confirmed:** symbol/range map in section 4. |
| `features/game/components/ui/GameBoardCell/GameBoardCell.tsx` (1,871 lines) | Datatrice projection, identity adaptation, cross-player attachment projection, mock-deck metadata, deck name lookup/navigation, optimistic move/rollback, library/card/counter/token/arrow command construction, and seat composition. | Retain it as the boundary component but extract a state view-model hook and cohesive command hooks. It should pass two grouped values instead of about forty flat callbacks. | New interface and internal hook extraction; normalized state stays in Datatrice. | **Confirmed:** helper projections at lines 45–190, selector/projection body from about 313, optimistic move at 771–1017, token/arrow commands at 1491–1797, prop fan-out at 1805–1865. |
| `features/game/Game.tsx` (349 lines) | Structured interaction providers and legacy menus/dialogs are mounted around a seat renderer that owns parallel versions; three callback props passed to `GameBoardCell` are ignored. | Use this existing game-level infrastructure as the final lifecycle owner. Remove ignored props only after a focused caller test; switch one subsystem at a time. | Interface cleanup and local UI-state relocation. | **Confirmed:** providers and DnD at [lines 160–184](../packages/webatrice/src/features/game/Game.tsx#L160), menus/dialogs at [251–329](../packages/webatrice/src/features/game/Game.tsx#L251), passed callbacks at [226–233](../packages/webatrice/src/features/game/Game.tsx#L226); `GameBoardCell` destructures only `cell` and `totalPlayers` at line 313. |
| `features/decks/DeckEditor.tsx` (2,552 lines) | Route/editor shell; sidebar; format picker; buy action; preview/price; main pane; quick add; rows/actions; printing modal; advanced search UI/query construction; filters; image preload; grouping. | Preserve `DeckEditor` as route façade; extract editor panes, row/dialog UI, pure query construction, and preload hook into named deck-feature owners. | Component and pure-function movement; no state owner change. | **Confirmed:** `DeckEditor` 91–298; `DeckSidebar` 319; `MainPane` 732; `QuickAddSearch` 1013; `CardRow` 1263; `PrintingPickerModal` 1553; `buildScryfallQuery` 1857; `AdvancedSearchView` 1917; `SearchFilters` 2081; `useDeckImagePreload` 2313. |
| `features/decks/Decks.tsx` (1,625 lines) | Data download/cache orchestration, deck summaries/prices, route rendering, row presentation, import workflow, create/delete dialogs, folder flattening, and localStorage view mode. | Preserve `Decks` route façade; extract list data hook, row components, import/create/delete dialogs, and one browser view-mode hook. | Component/hook movement; local browser state stays Webatrice-owned. | **Confirmed:** route/list body 110–465, modal workflow 876–1291, helper/dialog groups through line 1625. |
| `features/game/hooks/useGameDialogs.ts` (1,521 lines) | More than a dozen menu/dialog states, card prompts, player actions, hand actions, library actions, zone actions, lifecycle confirmations, and a very wide memoized contract. | Keep `useGameDialogs.ts` as a compatibility façade while composing smaller state and domain-action hooks. Do not create a generic “dialog helpers” bucket. | Hook extraction and contract composition; local UI state remains game-owned. | **Confirmed:** states 362–378, open/close handlers 381–494, card prompts 510–638, hand 743–1000, library 1005–1178, zone 1181–1272, lifecycle 1274–1299, action object 1336–1475. |
| `components/layout/TopBar.tsx` (701 lines) | Page chrome, route/tab derivation, user menu, deck-tree title lookup, two game settings, deck cache invalidation, localStorage external store, and last-route persistence. | Move page chrome to `feature-wrappers/layout`; move cross-feature-neutral settings/persistence to narrow root hooks/services; inject deck cleanup from `AppShell`. | File movement plus dependency inversion. | **Confirmed:** forbidden imports at [lines 10–20](../packages/webatrice/src/components/layout/TopBar.tsx#L10); main shell 68–349, `TabList` 358, `UserMenu` 419, tab derivation 523, sticky store 588–676, route persistence 678–701. |
| `features/decks/cardLookup.ts` (905 lines) | Dexie-backed card catalog, session cache, Scryfall fallback, batch lookup, related-card/printing discovery; consumed by decks and game. | Move the capability intact to `services/cards/cardCatalog.ts`, retaining the current exported types/functions during migration. It is a shared browser data service, not deck-feature behavior. | Mostly file movement and import redirection. | **Confirmed:** exports at lines 35, 79, 98, 114, 129, 137, 147, 193, 217, and 785; game imports listed under P1. |
| `features/game/components/PlayerBox/gameBattlefield.ts` plus `components/battlefield/Battlefield/gridMath.ts` | Two battlefield layout/math implementations with different pixel constants; the latter says it is the single grid source and has focused tests. | Keep wire packing and occupancy in existing `gridMath.ts`; move only PlayerBox’s scaled pixel layout to `battlefieldLayout.ts`. Compare outputs before deleting the sibling file. | Consolidation after characterization, not blind movement. | **Confirmed:** [gameBattlefield.ts](../packages/webatrice/src/features/game/components/PlayerBox/gameBattlefield.ts#L1), [gridMath.ts](../packages/webatrice/src/features/game/components/battlefield/Battlefield/gridMath.ts#L1), [gridMath.spec.ts](../packages/webatrice/src/features/game/components/battlefield/Battlefield/gridMath.spec.ts#L1). |
| `features/game/mockDeckStore.ts` and `PlayerBox/mockTypes.ts` | A localStorage “mock deck” bridge and copied Supabase/fancy-Webatrice types coexist with real Redux zone state. The bridge still provides metadata and library-search enrichment. | Do not delete immediately. First replace its remaining metadata role with the shared card catalog and a real presentation adapter; then remove the mock storage/type copy and lobby writes. | Data-source replacement and deletion; browser state removal after proof. | **Confirmed:** [mockDeckStore.ts](../packages/webatrice/src/features/game/mockDeckStore.ts#L1), [mockTypes.ts](../packages/webatrice/src/features/game/components/PlayerBox/mockTypes.ts#L1), real zone display lists at `PlayerBox.tsx` 5931–5940, selected mock deck use in `GameBoardCell.tsx` 752–758. |

### Boundary-specific findings

- `PlayerBox`, `IncomingRevealDialog`, and `LibrarySearchDialog` import `features/decks/cardLookup.ts` directly. **Confirmed.**
- `GameBoardCell` imports the deck feature barrel for `parseCod`; `GameLobby` imports `decks/cod` and `decks/types`; `mockDeckStore` imports a deck feature type. **Confirmed.**
- `TopBar` imports game setting hooks and deck cache functions. A scoped ESLint run reported all three imports as boundary errors. **Confirmed.**
- The orientation document’s statement that Webatrice has zero boundary violations is point-in-time and contradicted by the current scoped run. **Confirmed.**
- The current boundaries element model did not flag game-to-decks imports. The need for feature-name capture or an equivalent import restriction is **Confirmed**; the exact plugin configuration is **Unverified** until its installed-version schema is checked.

## 4. Detailed `PlayerBox.tsx` responsibility map

### Current responsibility inventory

| Responsibility | Current symbols / approximate range | Dependencies and side effects | Cohesive owner | Behavior that must not change | Evidence |
|---|---|---|---|---|---|
| Presentation and interaction models | `HandCard`, `BattlefieldCard`, `DragSourceZone`, `DropTarget`, `DragState`, `Selection` (77–221); `Props` (956–1340); `PlayerBoxHandle` (1355–1370). | Mixes copied deck metadata, server card identity, UI slots, wire sentinels, and callback contracts. | `components/ui/PlayerBoard/playerBoard.types.ts` for view/command contracts; existing selection/DnD owners for transient types. | Cross-player attachment retains source owner; hidden-zone positional IDs and stack insertion indices keep their meanings. | **Confirmed:** source ranges; cross-player behavior is also covered by [Battlefield.spec.tsx](../packages/webatrice/src/features/game/components/battlefield/Battlefield/Battlefield.spec.tsx#L334). |
| Zone and placement mapping | `wireZoneName`, `typeLineToTableRow`, `tableRowToGridY` (228–282). | Imports Sockatrice `ZoneName`; type-line heuristic is used during card placement after metadata lookup. | Move zone translation to the GameBoardCell command adapter; move pure placement policy to `components/battlefield/Battlefield/cardPlacement.ts` (**new**). | Preserve each current call path until the row-policy discrepancy is decided; invert Y exactly once. | **Confirmed:** calls at 5264–5265, 8534–8553, and 9162–9172. Current creature/other mapping differs from tested [playCard.ts](../packages/webatrice/src/features/game/hooks/playCard.ts#L12); this is a known decision, not a cleanup opportunity. |
| Card context-menu model and parity actions | `CardMenuItem`, `COUNTER_COLORS`, `BuildCardContextMenuArgs`, `buildRelatedTokenItems`, `buildTransformItems`, `buildCardContextMenu` (294–716). | Shortcut settings; related-card metadata; callback command ports; no direct DOM in builders. | Existing `components/context-menus/CardContextMenu`, with pure models in `cardContextMenu.model.ts` and `relatedCardActions.ts` (**new**). Use existing `ui/CardSlot/counterColors.ts`. | Menu order, labels, dividers, shortcut hints, owner gating, selection target semantics, token counts, transform mode, and counter IDs remain identical. | **Confirmed:** current builders and existing [CardContextMenu.tsx](../packages/webatrice/src/features/game/components/context-menus/CardContextMenu/CardContextMenu.tsx#L1). Exact upstream C++ citations embedded in comments are **Unverified**. |
| Context-menu rendering and popup positioning | `CardContextMenuPopup`, `CardContextSubmenu` (718–875), plus render-time menu branches (roughly 6257–7276 and 9683–10976). | Portals, document dismissal listeners, viewport measurement, z-index interactions with zone dialogs. | Existing `CardContextMenu.tsx`; `components/context-menus/useViewportClampedMenu.ts` (**new**) for the feature-scoped browser behavior. | Edge flipping, submenu behavior, Escape/outside-click dismissal, and menu-over-dialog z-order. | **Confirmed:** `useViewportClampedPopup.ts` is already shared by two PlayerBox menu renderers; menu-over-dialog comment at 801–807. |
| Stack and battlefield pixel layout | `MAX_STACK_PER_SLOT`, `LIBRARY_TOP_DRAG_PAYLOAD`, stack layout constants, `layoutStack` (877–934); `BattlefieldSlotOverlay` (1409–1498); extensive layout body (4377–4496, 5413–5537, 5990–6203). | DOM rectangles, player orientation, scaled card dimensions, sibling `gameBattlefield.ts`; wire coordinates are coupled to visual slots. | Existing `components/battlefield/Battlefield`; pure scaled pixel work in `battlefieldLayout.ts` (**new**), wire packing remains in `gridMath.ts`. | `x = column * 3 + subposition`, full-stack rejection/nearest-slot behavior, row orientation, stack title visibility, attachment layout, and snap-grid display. | **Confirmed:** both implementations and existing grid tests. Pixel equivalence between the two implementations is **Unverified** until comparison tests are added. |
| Zone presentation | `LargeZoneBox`, `CardBackZone` (1500–1697); display-list derivation (5910–5965); render branches for library, graveyard, exile, hand, stack (approximately 7278–9316). | Real Datatrice-projected props, hidden counts, local metadata, Card component, pointer handlers, context menus. | Existing `ui/HandZone`, `ui/ZoneStack`, `ui/StackColumn`, and `dialogs/ZoneViewDialog`; final composition in `PlayerBoard`. | Opponent hand secrecy, authoritative hidden counts, top-card/back rendering, hand-on-top orientation, stack order, and reveal access. | **Confirmed:** current components and real display-list comments at 5931–5940; existing leaf components have focused specs. |
| Numeric/text modal implementations | `evalLifeExpression` and `SetLifeModal` (1699–1846); P/T parsers and `SetPTModal` (1848–1991); `ViewNCardsModal` (1993–2105); `MoveTopUntilModal` (2107–2229); `DrawCardsModal` (2231–2327); `SetCardCounterModal` (2329–2452); `CreateTokenModal` (2454–2634); `MoveXCardsFromTopModal` (2636–2736); `SetAnnotationModal` (2738–2816). | Nine independent keydown listeners, validation/parsing, local open state, command callbacks, portals. | Reuse root `PromptDialog` through existing `useGameDialogs` for single-field prompts; put only pure life/P-T policies in named owner files; reuse existing `CreateTokenDialog`; give the multi-field move-until form a named `MoveTopUntilDialog`. | Initial values, accepted expression grammar, clamping, cancel/submit behavior, selection snapshots, and command batching. | **Confirmed:** current source and existing [Game.tsx](../packages/webatrice/src/features/game/Game.tsx#L272) prompt/dialog hosts. Whether each single-field visual can use `PromptDialog` without CSS/keyboard differences is **Unverified** and requires per-dialog characterization. |
| Player counters and information rendering | `ManaPip` (2818–2894), player identity/counter derivation (3046–3427), information and counter render branches from 7278 onward. | Board cell context, life/mana callbacks, animation refs, shortcut hints, browser timing. | Existing `right-sidebar/PlayerInfoPanel`; a narrow `PlayerManaCounters.tsx` (**new**) only if the current panel cannot express mana UI. | Counter IDs, life arithmetic, animation timing, spectator/edit gating, and player-target anchor geometry. | **Confirmed:** current code and existing `PlayerInfoPanel` tests; exact visual equivalence is **Unverified** until screenshot/component comparison. |
| Card metadata and external lookup | identity adaptation and `cardMetaByName`/token lookup (3046–3320); metadata use and preload (5942–5965); direct lookups during play/render around 8513 and 9141. | Direct deck-feature import; Dexie/Scryfall I/O; effects; caches; render fallback. | Root `services/cards/cardCatalog.ts`; state adaptation in `usePlayerSeatViewModel`; visual consumption through `CardSlot`. | Provider/printing selection, face metadata, related/reverse-related tokens, unknown fallback, batching, and no Scryfall request storm. | **Confirmed:** imports and source ranges; rate-limit rationale at 9203–9210. |
| Shortcut coordination | State/effects roughly 3657–4370 plus menu hints and multiple render handlers. | Browser key events, shortcut settings, selection state, modal/menu priority, command callbacks. | Existing `useGameShortcuts.ts`, fed by the grouped command ports and game dialog state. | Input/modal guards, target selection rules, shortcut rebinding, and no command on handled text input. | **Confirmed:** current source and existing [useGameShortcuts.ts](../packages/webatrice/src/features/game/hooks/useGameShortcuts.ts#L1). Equivalence between old and PlayerBox shortcut paths is **Unverified**. |
| Pointer, marquee selection, and bulk actions | drag/menu/selection state 3432–3647; marquee calculation 4811–4961; menu target snapshots and bulk handlers 6257–7276 and 9411–10535. | Window/document listeners, DOM hit tests, player-scoped selection singleton, protocol batching callbacks. | Existing `useGameSelection.ts`, `useGameBoxSelection.ts`, `BoxSelectOverlay`, and context-menu action hooks. | One selection owner, zone scoping, click-versus-drag threshold, snapshot-on-modal-open, multi-card atomicity where supported, and owner routing. | **Confirmed:** current code, [useGameBoxSelection.spec.ts](../packages/webatrice/src/features/game/hooks/useGameBoxSelection.spec.ts#L1), and [useGameDnd.spec.ts](../packages/webatrice/src/features/game/hooks/useGameDnd.spec.ts#L482). Current PlayerBox route itself is **Missing** direct coverage. |
| Drag/drop and global browser orchestration | `beginDrag`/start handlers (4507–4588), global pointer listeners (4607–4767), `zoneAtPoint` (4773–4794), `detectDropTarget` (4966–5154), `applyMove` (5165–5389), drop-slot helpers (5413–5537), drag ghost near 10993–11033. | `document.querySelectorAll`, `window` listeners, `document.body` cursor mutation, portal refs, cross-player DOM, wire command callback. | Existing DnD context and `useGameDnd`; popup layer collision remains there. Pure destination translation moves to GameBoardCell’s move command adapter. | Four-pixel PlayerBox threshold until a deliberate parity decision; portal z-order; same-zone no-op; stack/hand reorder; full stack returns no move; foreign lent-zone owner; deck top `cardId=0`; sideboard append `x=-1`; library reveal position mirroring. | **Confirmed:** current source; analogous structured rules already exist in [useGameDnd.ts](../packages/webatrice/src/features/game/hooks/useGameDnd.ts#L48). Right-arrow hook tests use an eight-pixel threshold, so unification requires an explicit decision. |
| Command coordination and optimistic update | `applyMove` plus menu/shortcut coordination; `startMoveTopUntil` (6208–6237); callbacks invoked throughout render. | Relies on `GameBoardCell` callbacks that construct Sockatrice requests and optimistic Datatrice dispatch/rollback. | Grouped command hooks under `GameBoardCell`; `useMoveTopUntil.ts` (**new**) for the UI workflow. | Command payloads, sentinels, one-index prompt to zero-index wire conversion, optimistic rollback, no hidden-information refresh, and sequential move-until behavior. | **Confirmed:** PlayerBox and [GameBoardCell.tsx](../packages/webatrice/src/features/game/components/ui/GameBoardCell/GameBoardCell.tsx#L771). |
| Main presentational composition | `PlayerBox` component (2896–11055), with returned JSX beginning at 7278. | Every responsibility above plus contexts and portals. | Existing `components/ui/PlayerBoard/PlayerBoard.tsx`. `PlayerBox` remains a temporary compatibility façade until the last phase. | Seat geometry, mirrored layout, hand placement, DOM anchors/test IDs introduced during characterization, focus and pointer behavior. | **Confirmed:** current source and existing `PlayerBoard` composition. |
| Inline parity documentation and legacy shims | Comments throughout; layout/placeholder header 936–954; mock prop comments 986–1064; no-op imperative handle 5539–5545; legacy slot shims 4472–4477; detailed wire/menu notes near their implementations. | Some comments preserve valuable invariants; some describe superseded mock behavior; many cite upstream C++ not present in reviewed scope. | Keep invariants with extracted owners and tests; move architecture rationale here or a dedicated parity document only when it spans owners; remove concrete obsolete statements. | Do not discard valid protocol/parity knowledge merely to shorten source. | **Confirmed / Unverified:** detailed disposition in section 7. |

### Current `PlayerBox` data and command flow

The important seam already exists but is flattened:

```text
Datatrice normalized state
        |
        v
GameBoardCell selectors + projections --------> PlayerBox props
        |                                           |
        +-- useWebClient/Sockatrice command closures <+
        +-- optimistic Datatrice dispatch/rollback

Game.tsx providers/menus/dialogs/DnD ---------> mostly parallel path
```

The target turns `GameBoardCell` into an explicit adapter and makes the game-level infrastructure authoritative:

```text
Datatrice selectors --> usePlayerSeatViewModel --> PlayerBoardModel --+
                                                                    |
useWebClient/Sockatrice --> grouped command hooks --> Commands ------+--> PlayerBoard + existing leaf owners
                                                                         |
Game.tsx interaction/dialog/DnD providers -------------------------------+
```

No normalized state crosses into a new Webatrice store. Optimistic changes still dispatch through Datatrice and roll back from the same command boundary.

## 5. Source-to-target extraction map

The tables below are the implementation map. “State relocation” means a lifecycle/ownership change for React state; extracting a hook without changing where it is instantiated is called out separately. Every phase keeps a compiling façade at the old public entry point.

### `PlayerBox` and game-seat extractions

Unless another file is linked, all source symbols and ranges in this table are from the current [PlayerBox.tsx](../packages/webatrice/src/features/game/components/PlayerBox/PlayerBox.tsx#L72). The detailed map in section 4 supplies the dependency/side-effect evidence behind each row.

| ID | Named source symbols / range | Exact proposed destination | Public surface and allowed import direction | Change class | Required preservation and tests | Prerequisite |
|---|---|---|---|---|---|---|
| PB-01 | `HandCard`, `BattlefieldCard` (77–138); `RoomMemberWithProfile` and `DeckCard` from [mockTypes.ts](../packages/webatrice/src/features/game/components/PlayerBox/mockTypes.ts#L1); the useful portions of `Props` (956–1340). | `packages/webatrice/src/features/game/components/ui/PlayerBoard/playerBoard.types.ts` (**new**) | Export `PlayerSeatViewModel`, `PlayerCardViewModel`, `PlayerBoardModel`, and the grouped command interfaces. Imported by `GameBoardCell`, `PlayerBoard`, and game leaf components only. It may import dependency-only Datatrice/Sockatrice types as `type`, but must not construct requests. | New interface and type-owner correction; no state relocation. | Type-level tests/fixtures for own/opponent/spectator seats, cross-player attachment owner, hidden zones, and counters. Do not expose deck-feature types. | P0 characterization. |
| PB-02 | `GameBoardCell` helpers `isLifeCounter`, `flattenBackendDecks`, `zoneToHandCards`, `revealedCardsToHandCards`, `projectCard`, `zoneToBattlefieldCards` (45–190); selectors/projection approximately 329–758. | `packages/webatrice/src/features/game/components/ui/GameBoardCell/usePlayerSeatViewModel.ts` (**new**) | `usePlayerSeatViewModel(cell, totalPlayers): PlayerBoardModel`. It may select Datatrice and call the root card catalog; it must not call command APIs. `GameBoardCell.tsx` is its only initial consumer. | Hook extraction at the same component lifecycle; no normalized-state relocation. | Selector-fixture tests for zone order/counts, revealed snapshots, active/mirrored flags, opponent hand secrecy, cross-player attachments, metadata fallback, and player identity. | PB-01 and shared card catalog (PB-06). |
| PB-03 | `GameBoardCell` optimistic move callback (771–1017) and `PlayerBox.applyMove` destination translation (5165–5389), including `wireZoneName` (228–264). | `packages/webatrice/src/features/game/components/ui/GameBoardCell/usePlayerZoneCommands.ts` (**new**) | `usePlayerZoneCommands(args): PlayerZoneCommands` with `move`, `draw`, `mulligan`, `shuffle`, `reveal`, `lend`, and top-card operations. It may use `useWebClient`, Datatrice dispatch/store reads, and Sockatrice types. Views may import only the interface from `playerBoard.types.ts`, not this hook. | Dependency inversion plus command consolidation; optimistic state remains Datatrice-owned. | Payload/rollback tests for all source/destination kinds, same-zone no-op, `DECK cardId=0`, library position, sideboard `x=-1`, `cardsToMove`, foreign lender owner, judge wrapper, and no hidden-information refresh. | PB-01, P0 command spies; first keep a compatibility adapter producing old callbacks. |
| PB-04 | `GameBoardCell` card/counter/token command closures approximately 1195–1676 and PlayerBox callback contracts/handlers. | `usePlayerCardCommands.ts` and `usePlayerCounterCommands.ts` in `packages/webatrice/src/features/game/components/ui/GameBoardCell/` (**new**) | `usePlayerCardCommands(args): PlayerCardCommands`; `usePlayerCounterCommands(args): PlayerCounterCommands`. Allowed: `useWebClient`, Datatrice reads/dispatch, `CardDTO`, Sockatrice types. Consumers receive interfaces only. | Hook extraction and grouped interface; no server-state relocation. | Focused request-shape tests for tap/flip/peek/does-not-untap, clone/transform/token, annotation, P/T, per-card counter, bulk batching, life/mana counter IDs, untap-all, and coin flip. | PB-01; preserve old callback adapter until menu/dialog migration. |
| PB-05 | `GameBoardCell.onAttachCard`, `onUnattachCard`, `onCreateArrow` and PlayerBox pending attach/arrow coordination (roughly 5804–5903, 9435–9455, 9904–10049, 10390–10421). | `packages/webatrice/src/features/game/components/ui/GameBoardCell/usePlayerTargetCommands.ts` (**new**) plus existing `hooks/useGameArrowInteractions.ts` for transient targeting. | `usePlayerTargetCommands(args): PlayerTargetCommands` constructs requests; `useGameArrowInteractions` owns pending target state and pointer/click resolution. | Dependency inversion and local UI-state relocation to the existing game-level lifecycle. | Own/opponent/hand/pile arrow origins; local-hand play-and-arrow; cancel on Escape/source; attach-many; unattach target omissions; player target anchors; no owner mutation from opponent menu. | PB-04 interface, P0 gesture tests. |
| PB-06 | [cardLookup.ts](../packages/webatrice/src/features/decks/cardLookup.ts#L1) in full; PlayerBox imports/use at 65–70, 3046–3320, 8513, 9141; sibling imports. | `packages/webatrice/src/services/cards/cardCatalog.ts` (**new**); tests at `packages/webatrice/src/services/cards/cardCatalog.spec.ts` (**new**) | Initially retain `LookupResult`, `LookupCardFace`, `RelatedCardRef`, `PrintingSummary`, `LookupHint`, `LookupInput`, `lookupCard`, `lookupCardsCached`, `lookupCards`, and `fetchAllPrintings`. Export via `services/cards/index.ts` (**new**) and, if needed, root `services/index.ts`. Root service may import existing root Dexie services/types; features import this service, never each other. | Mostly file movement/import redirection; no state relocation. | Move or add cache/Dexie/Scryfall fallback, batch, related-card, printing, unknown-result, abort/error, and request-deduplication tests. Update current comments naming the old path. | Independent P1. Keep a temporary deck-feature re-export for one commit if required, but game consumers switch directly to root immediately. |
| PB-07 | `typeLineToTableRow`, `tableRowToGridY` (266–282); related placement logic at 8534–8553 and 9162–9172; pure row logic in [playCard.ts](../packages/webatrice/src/features/game/hooks/playCard.ts#L12). | `packages/webatrice/src/features/game/components/battlefield/Battlefield/cardPlacement.ts` (**new**) | Export explicit policies such as `placementFromCardDatabaseRow(row)` and `legacyPlacementFromTypeLine(typeLine)`. `gridMath`, `playCard`, command hooks, and view adapters may import it. It must be pure and must not access Dexie or a client. | Pure extraction with intentional dual-policy interface; no behavior change. | Characterize both current mappings. Creature (`typeLine` path currently maps to 2/top) and `CardDTO.tablerow=1` (tested path maps to middle) must remain visibly distinct until the Cockatrice-parity decision in section 10. Test invert-Y separately and exactly once. | P0; do not consolidate the two policies as part of this move. |
| PB-08 | [gameBattlefield.ts](../packages/webatrice/src/features/game/components/PlayerBox/gameBattlefield.ts#L1); `BattlefieldSlotOverlay` (1409–1498); slot/layout helpers (4377–4496, 5413–5537); stack layout (877–934). | Scaled pixel policy to `packages/webatrice/src/features/game/components/battlefield/Battlefield/battlefieldLayout.ts` (**new**); wire packing/occupancy merged only where equivalent into existing [gridMath.ts](../packages/webatrice/src/features/game/components/battlefield/Battlefield/gridMath.ts#L1); UI into existing `Battlefield.tsx`, `BattlefieldRow.tsx`, and `BattlefieldStackColumn.tsx`. | `battlefieldLayout.ts` exports named dimension/slot-origin functions; `gridMath.ts` remains the only public grid packing/occupancy surface. Only battlefield/DnD modules import them. | Pure movement plus consolidation after comparison; no state relocation. | Golden numeric tests across scales/rows/player orientation; three subpositions; full stack; nearest free slot; attachment footprint; current PlayerBox snapshots before changing leaf render. | PB-07 and P0 visual/DOM contracts. Delete `gameBattlefield.ts` only after all callers move. |
| PB-09 | `CardMenuItem`, `BuildCardContextMenuArgs`, `buildCardContextMenu` (294–406, 571–716); `buildRelatedTokenItems`, `buildTransformItems` (408–569); duplicate `COUNTER_COLORS` (312–319). | `packages/webatrice/src/features/game/components/context-menus/CardContextMenu/cardContextMenu.model.ts` (**new**); `relatedCardActions.ts` (**new**); use existing [counterColors.ts](../packages/webatrice/src/features/game/components/ui/CardSlot/counterColors.ts#L1). | Pure builders consume command callbacks/shortcut hints and emit a typed menu model. Existing `CardContextMenu.tsx` renders it. Related-card builder may import root card-catalog result types. | Pure extraction and duplicate consolidation; no state relocation. | Exact menu tree snapshots for own/opponent, zone, face-down, attached, selection, counters A–F, tokens/DFC, shortcuts, labels/order/dividers/disabled state. Existing context-menu specs are a base but must add current PlayerBox-only branches. | PB-01, PB-04, PB-06. |
| PB-10 | `CardContextMenuPopup`, `CardContextSubmenu` (718–839, 853–875), [ContextMenu.tsx](../packages/webatrice/src/features/game/components/PlayerBox/ContextMenu.tsx#L1), and [useViewportClampedPopup.ts](../packages/webatrice/src/features/game/components/PlayerBox/useViewportClampedPopup.ts#L1). | Renderer behavior merges into existing `components/context-menus/CardContextMenu/CardContextMenu.tsx`; shared feature hook becomes `packages/webatrice/src/features/game/components/context-menus/useViewportClampedMenu.ts` (**new**). | The hook exports `{ref, position}` for game menus only. Context-menu components may import it; no root promotion unless a second non-game consumer appears. | File movement plus renderer convergence; local menu state later relocates to `useGameDialogs`. | Viewport-edge, submenu flip, outside click, Escape, focus, one-menu-at-a-time, and z-index over a zone dialog. | PB-09 and P0 DOM tests. |
| PB-11 | `parsePT`, `ptTokenToInt`, `applyPTDelta`, `applyPTSet` (1848–1906); `evalLifeExpression` (1699–1721). | P/T policy: `packages/webatrice/src/features/game/components/context-menus/CardContextMenu/cardAttributeEdits.ts` (**new**). Life policy: `packages/webatrice/src/features/game/components/right-sidebar/PlayerInfoPanel/lifeExpression.ts` (**new**). | Pure named functions imported by their action/dialog owner and specs only. | Simple pure extraction. | Table-driven grammar, empty/default PT, signed/flow values, variable PT, invalid life expressions, current rounding/clamping, and selection per-card base behavior. | Independent after P0 captures current outputs. |
| PB-12 | `SetLifeModal`, `SetPTModal`, `ViewNCardsModal`, `DrawCardsModal`, `SetCardCounterModal`, `CreateTokenModal`, `MoveXCardsFromTopModal`, `SetAnnotationModal` (1723–2105, 2231–2816), associated local states around 5568–5903 and 9553–9890. | Reuse existing [PromptDialog](../packages/webatrice/src/dialogs/PromptDialog/PromptDialog.tsx) via `useGameDialogs`; reuse existing `dialogs/CreateTokenDialog`; extend the relevant split action hook from UG-01 below. No duplicate modal destination is proposed unless characterization proves a necessary distinct UI. | `useGameDialogs` exposes named open actions and typed prompt state; `Game.tsx` remains the portal host. | Local UI-state relocation from each PlayerBox to game-level dialog state; interface reshape. | One global key listener/portal per active dialog, identical input defaults/validation, deck-size clamping for `ViewNCardsModal`, selection target snapshot, cancel/submit ordering, and current styling/keyboard behavior. If `PromptDialog` cannot preserve a behavior, create a specifically named game dialog under `features/game/dialogs`, not a generic modal. | PB-03/04 ports, PB-11, UG-01, P0 per-dialog tests. |
| PB-13 | [LibrarySearchDialog.tsx](../packages/webatrice/src/features/game/components/PlayerBox/LibrarySearchDialog.tsx#L1), [ZoneRevealDialog.tsx](../packages/webatrice/src/features/game/components/PlayerBox/ZoneRevealDialog.tsx#L1), [cardListSort.ts](../packages/webatrice/src/features/game/components/PlayerBox/cardListSort.ts#L1). | Enrich existing `packages/webatrice/src/features/game/dialogs/ZoneViewDialog/ZoneViewDialog.tsx`; move pure sort/group/filter to `packages/webatrice/src/features/game/dialogs/ZoneViewDialog/zoneViewSort.ts` (**new**). | `ZoneViewDialog` continues to self-source Datatrice state and dialog context. `zoneViewSort.ts` accepts `ZoneViewCardMetadata`, not deck-feature `DeckCard`. | Renderer consolidation and local-state relocation; interface reshape. | Multiple zone views, library top/bottom ordering, revealed card positional IDs, drop/reorder inside popup, search/sort/group, write access, clear/shuffle-on-close, and pointer-layer z-order. | PB-06 metadata model, PB-10 popup tests, existing ZoneViewDialog specs, P0 current PlayerBox dialog tests. |
| PB-14 | [IncomingRevealDialog.tsx](../packages/webatrice/src/features/game/components/PlayerBox/IncomingRevealDialog.tsx#L1), currently imported by `Game.tsx`; related metadata/sort behavior. | `packages/webatrice/src/features/game/dialogs/IncomingRevealDialog/IncomingRevealDialog.tsx` (**new**) and focused spec beside it. | Dialog imports Datatrice incoming-reveal state, root card catalog, `zoneViewSort`, and existing game DnD registration. It must not import deck internals or `PlayerBox`. | Mostly file movement plus DnD interface adaptation. | Sender/zone labels, receiver-only data, dismiss/clear, sorting/grouping, lender player ID on outbound drag, and absence of a local seat for pure spectators. | PB-06, PB-13, PB-16. |
| PB-15 | Selection state/effects approximately 3432–3607 and 4811–4961; bulk target derivation throughout menus; [selectionOwner.ts](../packages/webatrice/src/features/game/components/PlayerBox/selectionOwner.ts#L1). | Existing `packages/webatrice/src/features/game/hooks/useGameSelection.ts`, `useGameBoxSelection.ts`, and `utils/selection`; render preview through existing `BoxSelectOverlay`. | One game-level `GameSelection` contract via existing providers. Leaf cards/zones call context handlers. | State relocation from per-PlayerBox states/module singleton to the current game lifecycle. | Only one selection across seats, zone scoping, additive selection, empty-click clear, menu target rule, owner/card keys, opponent visual selection, selection survival/collapse on drag, unmount reset. | P0 tests; PB-01 view keys. Remove `selectionOwner.ts` only after all PlayerBoxes stop subscribing. |
| PB-16 | `DragState`, `DropTarget`, `beginDrag`, global pointer listeners, `zoneAtPoint`, `detectDropTarget`, `applyMove`, drag ghost (142–212, 4507–5537, 10993–11033); [foreignDragContext.tsx](../packages/webatrice/src/features/game/components/PlayerBox/foreignDragContext.tsx#L1). | Existing `packages/webatrice/src/features/game/hooks/useGameDnd.ts`, `DndContext`, `CardDragOverlay`, droppable leaf hooks; PB-03 command port. | Extend existing DnD data types with hidden-zone positional source and lender owner. `useGameDnd` remains the only gesture-to-destination coordinator and obtains the client through `useWebClient()`. | Local state/lifecycle relocation and DnD interface reshape. | Characterize the current four-pixel threshold before choosing a common threshold; portal-layer hit testing; card-anchored ghost; hand/stack/popup reorders; battlefield coordinates; group moves; cross-player gift/lent-zone routes; same-zone no-op; browser cursor cleanup. | PB-03, PB-08, PB-13/14, PB-15, P0 pointer tests. Remove foreign-drag registry after reveal dialog uses DnD data directly. |
| PB-17 | `MoveTopUntilModal` (2107–2225); `startMoveTopUntil` and its state/effect chain (6106–6237), prompt/menu triggers. | UI to `packages/webatrice/src/features/game/dialogs/MoveTopUntilDialog/MoveTopUntilDialog.tsx` (**new**); workflow to `packages/webatrice/src/features/game/hooks/useMoveTopUntil.ts` (**new**). | The named dialog obtains open/form actions from game dialog context; `useMoveTopUntil({playerId, stackCards, move, reveal/clear dependencies}): {state,start,cancel}` observes projected state and dispatches only through `PlayerZoneCommands`. | Named component movement plus stateful workflow extraction; later lifecycle moves to game dialog state. | Filter text, hit count 1–99, auto-play flag, deck-empty disabling, stop condition, sequential request timing, cancellation/unmount, revealed-state cleanup, and no duplicate move when Redux updates race. | PB-03, UG-01, and P0 dialog/fake-timer/store-update tests. |
| PB-18 | [Card.tsx](../packages/webatrice/src/features/game/components/PlayerBox/Card.tsx#L1), `ManaSymbols.tsx`, `cardSize.ts`, `cardScale.tsx`; card render branches; duplicate visual providers in `Game.tsx`. | Merge card rendering into existing `components/ui/CardSlot/CardSlotContent.tsx`; move mana rendering to `components/ui/CardSlot/ManaSymbols.tsx` (**new**); move the scale provider to `components/ui/CardScaleContext.tsx` (**new**) if CSS alone cannot own it. | Leaf UI props use `PlayerCardViewModel`; no client, selectors, or card lookup in render. | Renderer convergence, not a blind file rename. | Face pair, card back, tap/flip, P/T/counters/annotation, provider printing, hover/focus, selected/dragging, image error fallback, scale across row counts, accessibility and current test IDs. | PB-01/02/06, P0 screenshots; use existing CardSlot specs as target contract. |
| PB-19 | [hoveredCard.tsx](../packages/webatrice/src/features/game/components/PlayerBox/hoveredCard.tsx#L1), [bigCardPreview.tsx](../packages/webatrice/src/features/game/components/PlayerBox/bigCardPreview.tsx#L1), and parallel existing preview providers. | Existing `packages/webatrice/src/features/game/components/ui/CardPreviewContext.tsx` and `components/CardPreviewPopup/*`. | One `CardPreviewContext` with a presentation-card payload; Game owns provider, CardSlot emits hover/focus. | Local state/provider consolidation. | Mouse and keyboard preview, provider printing/face, popup window channel, clear on unmount, no render storm during pointer movement. | PB-18, focused preview tests. |
| PB-20 | Player info/counter presentation including `ManaPip` (2818–2894) and main JSX starting 7278; zone presentation branches. | Existing `right-sidebar/PlayerInfoPanel`, `ui/HandZone`, `ui/ZoneStack`, `ui/StackColumn`, `battlefield/Battlefield`, composed by existing `ui/PlayerBoard/PlayerBoard.tsx`. | `PlayerBoard({model, commands})` or equivalent contexts, with no selectors/request construction in leaf views. | Presentational convergence behind `PlayerBox` façade. | Seat layout, mirror/hand-on-top, active glow, hand secrecy/count, all click/context anchors, CSS class/geometry and focus order. | All PB extractions above; switch one region at a time using façade props. |
| PB-21 | `PlayerBoxHandle.receiveBattlefieldCards` (1355–1370) and no-op implementation 5539–5545; legacy slot-bound shims 4472–4477; remaining mock `cards` path and [mockDeckStore.ts](../packages/webatrice/src/features/game/mockDeckStore.ts#L1). | Delete the no-op handle/member; delete `mockDeckStore.ts` and `mockTypes.ts`; remove `PlayerBox.tsx` and remaining siblings only after callers are zero. Keep any still-needed slot compatibility inside `PlayerBoard` until the relevant view is migrated. | Deletion after caller proof; mock data-source removal. | `rg` currently finds no caller of `receiveBattlefieldCards`; rerun at implementation time. Metadata must already come from PB-02/PB-06, and all zones from Datatrice. | PB-02/06/20, full integration and E2E gate. |

### Other confirmed hotspot extractions

All `DE-*` ranges below are from current [DeckEditor.tsx](../packages/webatrice/src/features/decks/DeckEditor.tsx#L91), all `DL-*` ranges from current [Decks.tsx](../packages/webatrice/src/features/decks/Decks.tsx#L110), all `UG-*` ranges from current [useGameDialogs.ts](../packages/webatrice/src/features/game/hooks/useGameDialogs.ts#L330), and all `TB-*` ranges from current [TopBar.tsx](../packages/webatrice/src/components/layout/TopBar.tsx#L68). `DP-*` rows link or name their current deck/game consumers directly.

| ID | Named source symbols / range | Exact proposed destination | Public surface / direction | Change class and validation | Evidence / prerequisite |
|---|---|---|---|---|---|
| DE-01 | `DeckSidebar`, `SidebarFormatPicker`, `DeckBuyButton` (319–582). | `features/decks/components/editor/DeckSidebar.tsx` (**new**). | `DeckSidebarProps` containing editor-derived state/actions; deck feature only. | Component movement. Component specs for format, buy disabled/loading, and sidebar actions. | **Confirmed.** After PB-06 so card-catalog imports are stable. |
| DE-02 | `CardPreview`, `CardPricePill` (584–730). | `features/decks/components/editor/DeckCardPreview.tsx` (**new**). | Presentational props only; may consume root card result type. | Component movement. Image/price/missing-data tests. | **Confirmed.** PB-06. |
| DE-03 | `MainPane`, `QuickAddSearch`, `CardGroup`, `CardRow`, `RowActionsMenu` (732–1551). | `DeckMainPane.tsx`, `QuickAddSearch.tsx`, `DeckCardGroup.tsx`, `DeckCardRow.tsx`, and `DeckRowActionsMenu.tsx` under `features/decks/components/editor/` (**new**). | Narrow props derived from `useDeckEditor`; no route or persistence ownership. | Component movement, preserving keyboard/focus and mutation callbacks; focused specs per boundary. | **Confirmed.** Keep `DeckEditor.tsx` façade. |
| DE-04 | `PrintingPickerModal` (1553–1766). | `features/decks/dialogs/PrintingPickerDialog.tsx` (**new**). | Typed selected-card/printing props; imports root card catalog, not feature data-loading internals. | Component move and name correction; dialog keyboard/error/selection tests. | **Confirmed.** PB-06. |
| DE-05 | advanced search types/state, `buildScryfallQuery`, `AdvancedSearchView`, `SearchFilters` (approximately 1800–2311). | `features/decks/components/search/AdvancedCardSearch.tsx`, `CardSearchFilters.tsx`; pure builder at `features/decks/cardSearchQuery.ts` (**new**). | `buildScryfallQuery(filters): string`; view callbacks remain deck feature. | Pure extraction plus component movement. Query table tests and form interaction tests. | **Confirmed.** |
| DE-06 | `useDeckImagePreload` (2313 onward); `groupCards`, `bucket` (2513–2552). | `features/decks/hooks/useDeckImagePreload.ts`; pure grouping at `features/decks/deckGrouping.ts` (**new**). | Narrow named APIs; deck feature only. | Simple hook/pure movement. Cache/error and grouping-order tests. | **Confirmed.** |
| DL-01 | `Decks` download/cache/list orchestration and summaries (110–465). | `features/decks/hooks/useDeckList.ts` (**new**). | Returns `{rows,status,refresh,summaryById}`; obtains client via `useWebClient`; no JSX. | Hook extraction at same route lifecycle. Mock client/event/cache tests. | **Confirmed.** PB-06/DP-01 for shared parsing. |
| DL-02 | Deck summary/badge/row presentation after main component through roughly 875. | `features/decks/components/list/DeckRow.tsx`, `DeckSummary.tsx`, and `DeckBadges.tsx` (**new**). | Presentational deck-feature props. | Component movement and row interaction tests. | **Confirmed.** |
| DL-03 | Import workflow/modal approximately 876–1291. | `features/decks/dialogs/ImportDeckDialog.tsx` (**new**). | Owns file/text import UI and calls a supplied deck import action; deck parser comes from DP-01. | Local UI-state movement within same route; file/parse/error/upload tests. | **Confirmed.** DP-01. |
| DL-04 | Create modal, delete dialog, view preference, folder flattening through 1625. | `features/decks/dialogs/CreateDeckDialog.tsx`, `DeleteDeckDialog.tsx`; `features/decks/hooks/useDeckListViewMode.ts`; `features/decks/deckTree.ts` (**new**). | Named UI/browser/pure APIs; no general helpers. | Component, browser hook, and pure movement. localStorage fallback and folder-order tests. | **Confirmed.** |
| UG-01 | `useGameDialogs` state (362–378), open/close handlers (381–494), action domains (510–1299), action object (1336–1475). | `features/game/hooks/dialogs/useGameDialogState.ts`, `useCardDialogActions.ts`, `useHandDialogActions.ts`, `useLibraryDialogActions.ts`, `useZoneDialogActions.ts`, `useGameLifecycleDialogActions.ts` (**new**). `useGameDialogs.ts` remains the façade. | Each action hook owns one domain and receives explicit store readers, command ports/client, and state openers. Only façade exports `GameDialogs` initially. | Hook extraction; keep instantiation in `useGameDialogs` so lifecycle does not change. Move existing tests by behavior group and retain façade contract tests. | **Confirmed:** ranges in section 3. Required before PB-12/13 state convergence. |
| TB-01 | `TopBar`, `TabList`, `UserMenu` (68–521). | `packages/webatrice/src/feature-wrappers/layout/TopBar.tsx` (**moved**) with co-located components if they remain private. | Export `TopBar`; import root owners and feature widgets only. `Layout.tsx` uses a same-wrapper import. | File movement plus removal of forbidden imports. Existing render/route/user tests or new focused specs. | **Confirmed:** page chrome rule and current `Layout` ownership. |
| TB-02 | tab matching/derivation and deck-tree flattening (523–586); sticky external store (588–676). | `feature-wrappers/layout/shellTabs.ts` and `feature-wrappers/layout/useStickyShellTabs.ts` (**new**). | Pure `deriveShellTabs(location,data)` and browser hook. Wrapper-private; no feature import. | Pure/hook extraction. Route transition, refresh, tab close, malformed localStorage, and multi-subscriber tests. | **Confirmed.** TB-01. |
| TB-03 | last-route persistence (678–701), also consumed from shell composition. | `packages/webatrice/src/services/browser/routePersistence.ts` (**new**). | `readLastRoute`, `writeLastRoute`, `clearLastRoute`; imports no feature. | Simple movement. Browser-disabled/malformed value tests. | **Confirmed.** |
| TB-04 | `useSnapGridSetting` and `usePhaseTrackPinnedSetting` imports at TopBar 10–11; current game-hook modules. | `packages/webatrice/src/hooks/useSnapGridVisible.ts` and `usePhaseTrackPinned.ts` (**moved**), retaining current export names. | Root browser preference hooks may import root services/types only. Game and wrapper may import them. | Ownership move, no lifecycle change. Existing hook behavior plus storage/subscription tests. | **Confirmed:** settings are used by game and shell chrome. |
| TB-05 | `TopBar` calls `clearDeckEditorCache` and `clearDecksListCache` around 157–158. | `feature-wrappers/layout/ShellTabLifecycleContext.tsx` (**new**); adapter supplied by `AppShell.tsx`. | Wrapper calls `onIdentityChanged()`/`onTabClosed(tab)` without knowing decks. `AppShell` may import feature public barrels and inject deck cleanup. | Dependency inversion. Contract test proves wrapper invokes port; AppShell adapter test proves deck public cleanup functions run. | **Confirmed:** live boundary error. Exact event naming is an implementation decision; required semantic is identity/tab lifecycle, not “clear deck cache.” |
| DP-01 | `features/decks/cod.ts`, `meta.ts`; shared document portions of `types.ts` (`DeckCategory`, `ParsedCard`, `DeckMeta`, `BracketAssessment*`, `ParsedDeck`); game imports in `GameLobby`/`GameBoardCell`. | `services/decks/cockatriceDeckDocument.ts`, `services/decks/cockatriceDeckMetadata.ts`; dependency-free types in `types/cockatriceDeck.ts` (**new**). | Retain `parseCod`, `serializeCod`, `emptyCod` and metadata APIs. Deck feature imports root service; game imports only root summary/document APIs. Keep hydrated editor-only `DeckCard`/`HydratedDeck` in the deck feature. | File movement plus type split. Move [cod.spec.ts](../packages/webatrice/src/features/decks/cod.spec.ts) and [meta.spec.ts](../packages/webatrice/src/features/decks/meta.spec.ts) to root service specs, preserving fixtures. | **Confirmed:** cross-feature imports and current module dependencies. Do before removing mock deck bridge. |
| DP-02 | `MTG_FORMAT_LABELS`, `MTG_FORMATS`, `COMMANDER_FORMATS`, `normalizeFormat`, `isMtgFormat`, `isCommanderFormat` from `features/decks/types.ts` (21–73), consumed by `GameLobby`. | `packages/webatrice/src/types/deckFormat.ts` (**new**). | Dependency-free constants/types/functions; game and decks import root type module. | Simple ownership move. Table tests for known/custom/case/whitespace formats. | **Confirmed.** |

### Proposed grouped seat interface

The exact field names can be adjusted during implementation, but the grouping and dependency direction are required. This is illustrative, not an implementation patch:

```ts
export interface PlayerBoardModel {
  seat: PlayerSeatViewModel;
  zones: {
    hand: VisibleOrCountedZone;
    library: HiddenZoneViewModel;
    graveyard: VisibleZoneViewModel;
    exile: VisibleZoneViewModel;
    stack: VisibleZoneViewModel;
    battlefield: BattlefieldViewModel;
    sideboard: HiddenZoneViewModel;
  };
  counters: PlayerCounterViewModel;
  permissions: PlayerBoardPermissions;
}

export interface PlayerBoardCommands {
  zone: PlayerZoneCommands;
  card: PlayerCardCommands;
  counter: PlayerCounterCommands;
  target: PlayerTargetCommands;
}
```

This interface is not permission to wrap forty callbacks in one object unchanged. Each port must use semantic operations and own payload translation. For example, a view requests `zone.move(cards, destination)`; only the command adapter decides Sockatrice `startPlayerId`, `targetPlayerId`, `x`, `y`, `isReversed`, or hidden-zone sentinel fields.

## 6. Proposed target tree and public dependency direction

Only relevant branches are shown. `+` means new, `~` means an existing file changes or receives behavior, and `→` means a current file moves. Proposed paths are intentionally rendered as code rather than links because they do not exist yet.

```text
packages/webatrice/src/
├── AppShell.tsx                                      ~ supplies shell lifecycle adapter
├── feature-wrappers/layout/
│   ├── Layout.tsx                                   ~ imports co-located TopBar
│   ├── TopBar.tsx                                   ← components/layout/TopBar.tsx
│   ├── ShellTabLifecycleContext.tsx                 + feature-neutral port
│   ├── shellTabs.ts                                 + pure route/tab derivation
│   └── useStickyShellTabs.ts                        + shell browser state
├── hooks/
│   ├── usePhaseTrackPinned.ts                       ← features/game/hooks/
│   └── useSnapGridVisible.ts                        ← features/game/hooks/
├── services/
│   ├── browser/routePersistence.ts                  + last-route persistence
│   ├── cards/
│   │   ├── cardCatalog.ts                           ← features/decks/cardLookup.ts
│   │   ├── cardCatalog.spec.ts                      + characterization
│   │   └── index.ts                                 + narrow barrel
│   └── decks/
│       ├── cockatriceDeckDocument.ts                ← features/decks/cod.ts
│       ├── cockatriceDeckDocument.spec.ts           ← features/decks/cod.spec.ts
│       ├── cockatriceDeckMetadata.ts                ← features/decks/meta.ts
│       └── cockatriceDeckMetadata.spec.ts           ← features/decks/meta.spec.ts
├── types/
│   ├── cockatriceDeck.ts                            + document-only types
│   └── deckFormat.ts                                + shared format values
└── features/
    ├── decks/
    │   ├── DeckEditor.tsx                           ~ route façade
    │   ├── Decks.tsx                                ~ route façade
    │   ├── cardSearchQuery.ts                       + pure search serialization
    │   ├── deckGrouping.ts                          + editor grouping policy
    │   ├── deckTree.ts                              + folder flattening
    │   ├── components/editor/                       + named editor leaves
    │   ├── components/list/                         + named list leaves
    │   ├── components/search/                       + advanced-search UI
    │   ├── dialogs/                                 + deck-specific dialogs
    │   └── hooks/                                   + list/preload/view-mode hooks
    └── game/
        ├── Game.tsx                                 ~ sole interaction/dialog host
        ├── components/
        │   ├── battlefield/Battlefield/
        │   │   ├── gridMath.ts                      ~ sole wire grid/occupancy math
        │   │   ├── battlefieldLayout.ts             + scaled pixel layout
        │   │   └── cardPlacement.ts                 + explicit row policies
        │   ├── context-menus/
        │   │   ├── useViewportClampedMenu.ts        + game-menu browser policy
        │   │   └── CardContextMenu/
        │   │       ├── CardContextMenu.tsx          ~ sole renderer
        │   │       ├── cardAttributeEdits.ts        + pure P/T policy
        │   │       ├── cardContextMenu.model.ts     + pure menu tree
        │   │       └── relatedCardActions.ts        + token/transform model
        │   ├── right-sidebar/PlayerInfoPanel/
        │   │   ├── PlayerInfoPanel.tsx              ~ sole player-info surface
        │   │   ├── PlayerManaCounters.tsx           + only if needed
        │   │   └── lifeExpression.ts                + pure counter expression
        │   └── ui/
        │       ├── CardScaleContext.tsx              + if CSS cannot own scale
        │       ├── CardPreviewContext.tsx            ~ sole preview state
        │       ├── CardSlot/                         ~ sole card renderer
        │       ├── GameBoardCell/
        │       │   ├── GameBoardCell.tsx             ~ adapter/composer
        │       │   ├── usePlayerSeatViewModel.ts     + Datatrice projection
        │       │   ├── usePlayerZoneCommands.ts      + zone protocol adapter
        │       │   ├── usePlayerCardCommands.ts      + card protocol adapter
        │       │   ├── usePlayerCounterCommands.ts   + counter protocol adapter
        │       │   └── usePlayerTargetCommands.ts    + arrow/attach adapter
        │       └── PlayerBoard/
        │           ├── PlayerBoard.tsx               ~ final seat composition
        │           └── playerBoard.types.ts          + model/ports
        ├── dialogs/
        │   ├── IncomingRevealDialog/                 ← PlayerBox sibling
        │   ├── MoveTopUntilDialog/                   + multi-field workflow form
        │   └── ZoneViewDialog/
        │       ├── ZoneViewDialog.tsx                ~ sole zone viewer
        │       └── zoneViewSort.ts                   + sort/group/filter policy
        └── hooks/
            ├── dialogs/                              + domain-specific action hooks
            ├── useGameDialogs.ts                     ~ stable façade
            ├── useGameDnd.ts                         ~ sole DnD coordinator
            ├── useGameSelection.ts                   ~ sole selection state
            ├── useGameShortcuts.ts                   ~ sole shortcut coordinator
            └── useMoveTopUntil.ts                    + one workflow
```

### Allowed public direction

```text
AppShell
  ├── feature-wrappers/layout ──> root hooks/services/types + feature-widgets
  └── features/{game,decks}  ──> root hooks/services/types + feature-wrappers/widgets

features/game
  GameBoardCell adapter ──> Datatrice selectors + useWebClient + Sockatrice command types
       ├── PlayerBoardModel ──> PlayerBoard/leaf views
       └── grouped commands ──> interaction/dialog hooks ──> leaf views

features/decks ──> services/cards + services/decks + root deck types

Never:
  features/game ──> features/decks
  feature-wrappers ──> features/*
  leaf presentation ──> normalized selectors or protocol payload construction
```

The temporary `PlayerBox` façade may import target game modules while migration is in progress. Target modules must not import back from `PlayerBox`; that rule prevents a compatibility layer from becoming the permanent dependency center.

## 7. Inline documentation disposition

Unless another file is linked, ranges in this section refer to current [PlayerBox.tsx](../packages/webatrice/src/features/game/components/PlayerBox/PlayerBox.tsx#L72). The table groups adjacent comments that document one material subject; it does not classify formatting labels or obvious one-line JSX narration separately. The classification follows the comment to the code that will own the behavior. “Move” means move the useful content with the implementation and turn executable invariants into test names/assertions where possible.

| Material comment block | Disposition | Concrete evidence and action | Evidence label |
|---|---|---|---|
| `HandCard` physical-instance and annotation explanation (72–89). | **Update, then move** to `playerBoard.types.ts`. | The “deck row expands into physical HandCards” framing reflects the copied deck model, while current zone identity comes from Redux-projected server cards. Retain the distinction between a rendered card instance and quantity-based deck metadata, and retain stack annotation behavior, but remove the implication that deck rows own live identity. | **Confirmed:** real `handCards`/`stackCards` are supplied by `GameBoardCell`; display lists at 5931–5940 no longer use mock zones. Server-side reset rationale is **Unverified** unless checked against the relevant Cockatrice source. |
| `BattlefieldCard` owner, subslot, tapped, face-down, P/T, does-not-untap, color, annotation, attachment, and counter field comments (90–138). | **Keep co-located, then move** to `PlayerCardViewModel` and battlefield/command tests. | These fields encode behavior a maintainer needs. Cross-player attachment ownership is exercised in existing Battlefield tests and in `GameBoardCell` projection. Move command-routing notes to the command port and render notes to CardSlot rather than keeping both under one type. | **Confirmed** for current Webatrice behavior. Exact server reset/palette claims are **Unverified**. |
| Drag-source, drop-target, and live drag-state blocks (139–212), including lender owner and library/sideboard positional fields. | **Move** to `useGameDnd` data contracts and `usePlayerZoneCommands`; split view concerns from wire translation. | The fields are used by `detectDropTarget`/`applyMove`, and they capture non-obvious hidden-zone and foreign-owner semantics. They become misleading if left on deleted PlayerBox-only types. | **Confirmed:** calls at 4966–5389 and foreign drag registry. Servatrice internal line references are **Unverified**. |
| Four-pixel drag threshold and marquee-zone comments (202–221). | **Keep co-located, then update** beside the authoritative gesture policy. | They explain a real click/drag guard and zone selection scope. Do not silently replace four pixels with the eight-pixel right-arrow threshold currently asserted by `useGameArrowInteractions.spec.ts`. The final common threshold is unresolved. | **Confirmed:** `PlayerBox` constant at 215 and arrow test at [useGameArrowInteractions.spec.ts](../packages/webatrice/src/features/game/hooks/useGameArrowInteractions.spec.ts#L104). |
| `wireZoneName`, type-line classification, and `tableRowToGridY` comments (227–282). | **Move and update** to the zone command adapter and `cardPlacement.ts`. | The zone translation is valid command-boundary knowledge. The type-line row explanation is contradicted by the current tested `CardDTO.tablerow` convention: PlayerBox maps creature to 2, while `playCard.ts` and tests treat creature as 1 and other permanent as 2. Preserve both behavior paths and document their source explicitly. | **Confirmed:** implementations and [playCard.spec.ts](../packages/webatrice/src/features/game/hooks/playCard.spec.ts#L1). The claimed `oracleimporter.cpp` convention is **Unverified**. |
| Card-menu overview stating that most items are placeholders and only tap/flip/move dispatch (284–292). | **Update immediately; remove after menu migration.** | It is concretely false: current builders and render handlers dispatch peek, P/T, annotation, counters, attach/unattach, arrows, clone/token/transform, selection, and life actions. Replace with a short statement that the builder models the currently implemented parity surface; move per-action details to model/action tests. | **Confirmed:** builders at 571–716 and handlers throughout 6257–7276/9411–10976. |
| Menu item field and callback-contract comments (299–406). | **Move** to `cardContextMenu.model.ts` and grouped command interfaces. | These are useful interface documentation, especially shortcut reactivity, owner gating, attach/arrow state, selection scopes, and batch targets. Split UI model comments from wire-command comments so the model remains wire-agnostic. | **Confirmed** for current calls; upstream C++ line citations are **Unverified**. |
| Related-token and transform action blocks (408–569), including count/persistent/DFC behavior. | **Move** to `relatedCardActions.ts`; convert each branch to table tests. | The comments explain a cohesive, non-obvious policy used by own and opponent menus. Root card-catalog result types replace the deck-feature dependency. Keep the currently implemented `count="x"` behavior even where the comment identifies a future prompt. | **Confirmed** for current builder output. Exact Cockatrice implementation references are **Unverified**. |
| Inline counter menu, peek, unattach, and related-item notes inside `buildCardContextMenu` (581–711). | **Keep co-located after move**, but deduplicate against the longer interface comments. | Branch-local rationale helps explain conditional menu shape. Keep one explanation per condition and place desktop-source references in test names or a parity note. | **Confirmed** for current conditions. |
| Menu z-index explanation (801–807). | **Move** to the authoritative menu CSS/renderer and a popup-layer test. | It records a concrete regression: menu must sit over zone-view dialog. The number itself should be owned by CSS, not copied in an architectural document. | **Confirmed:** current renderer classes and dialog layering behavior. |
| Viewport-clamping block inside `PlayerBox.tsx` (841–851). | **Remove from `PlayerBox`; keep/update in the extracted hook.** | The implementation was already extracted to `useViewportClampedPopup.ts`; the in-file block documents code that is no longer there and duplicates the hook’s own documentation. | **Confirmed:** [useViewportClampedPopup.ts](../packages/webatrice/src/features/game/components/PlayerBox/useViewportClampedPopup.ts#L1). |
| Battlefield stack limit, hidden-library drag sentinel, stack offsets, and `layoutStack` comments (877–934). | **Move** to `gridMath.ts`, `battlefieldLayout.ts`, and DnD source-data tests according to subject. | These are current invariants, but they mix three owners. Preserve `cardId=0` top-deck protocol behavior and current visual spacing independently. | **Confirmed** for current code. “Cockatrice HiddenZone convention” source citation is **Unverified** beyond current request shapes and repository tests. |
| PlayerBox ASCII layout and “all zones are placeholders” block (936–954). | **Update now; move the durable layout statement to `PlayerBoard`.** | The placeholder assertion is directly contradicted by real Redux-derived `handCards`, `battlefieldCards`, `stackCards`, revealed deck, grave, exile, sideboard, and counts. The seat geometry/hand secrecy portion remains useful. | **Confirmed:** `GameBoardCell` projections and PlayerBox 5931–5940. |
| Behavioral prop comments for active/mirrored/hand orientation, counters, zone visibility, and command semantics (959–1340). | **Move and split** across `PlayerBoardModel` and grouped command ports. | These describe useful contracts but the flat prop list hides owners. Presentation facts belong on model fields; Sockatrice sentinel/payload facts belong on command operations and their tests. | **Confirmed** for current prop consumption. |
| Prop comments saying zones fall back to or are seeded from local mocks (notably approximately 986–1064). | **Remove or update** after recording the remaining metadata-only dependency. | Current comments at 3409–3411, 3648–3650, 5250–5253, and 5931–5940 explicitly state Redux/server ownership and no local zone mock. The `cards` prop still enriches metadata/library search, so describe that narrow transitional role until PB-06/PB-21 remove it. | **Confirmed.** |
| `PlayerBoxHandle.receiveBattlefieldCards` contract and legacy imperative prose (1351–1370, 5539–5545). | **Remove** with the API after a final caller search. | Its implementation is an empty function because Redux observes gifted cards. A repository search over Webatrice source/integration/E2E found no invocation; only the type and no-op implementation exist. | **Confirmed** for current source; caller absence is **Missing** after scoped `rg` search. |
| Battlefield overlay and zone component comments (1409–1697). | **Move** to existing Battlefield/ZoneStack/StackColumn leaf owners; keep only local geometry or accessibility invariants. | The comments explain useful visual behavior but are attached to private components embedded in the monolith. Existing intended owners now exist and have specs. | **Confirmed.** |
| Life expression, P/T grammar, and modal validation comments (1699–2816). | **Move** with pure policies and dialog action tests; remove repeated modal-shell narration. | The grammars are valuable. Repeated “Escape closes”/overlay descriptions should live once in `PromptDialog`/dialog shell coverage after convergence. | **Confirmed** for current code. Parity claims about exact desktop expression behavior are **Unverified** without upstream comparison. |
| Player identity/card metadata lookup comments around 3046–3320, including duplicate explanatory blocks around 3059–3072. | **Move and deduplicate.** | Keep one explanation of why metadata is batched and how related tokens are enriched in `usePlayerSeatViewModel`/card catalog. Remove the adjacent duplicate; keep the rate-limit/fallback rationale with the catalog or image component. | **Confirmed:** duplicated subject and direct lookup effects. The actual external rate limit encountered by prior authors is **Unverified** in this review, although the code clearly avoids per-card fallback when metadata exists. |
| Selection-owner singleton header in [selectionOwner.ts](../packages/webatrice/src/features/game/components/PlayerBox/selectionOwner.ts#L3). | **Update during migration, then remove with the singleton.** | The one-owner invariant is useful, but the rationale that context would require too much plumbing is superseded by the many game-level contexts already mounted in `Game.tsx` and by existing `useGameSelection`. Move the invariant to the authoritative selection hook/test. | **Confirmed.** |
| Foreign-drag registry comments in [foreignDragContext.tsx](../packages/webatrice/src/features/game/components/PlayerBox/foreignDragContext.tsx#L13). | **Move the lender-owner invariant to DnD; remove registry-mechanism commentary after convergence.** | The dialog-to-board drag requirement remains real. The render-time mutable registry is an implementation workaround for the parallel PlayerBox DnD stack and should not become architectural doctrine. | **Confirmed** for current implementation; whether a spectator can drag lent cards without a local seat needs a new test and is **Unverified**. |
| Menu/document listeners, wheel handling, body cursor mutation, global pointer/marquee listeners, draw-arrow capture, and portal comments (roughly 3432–4767, 5804–5903, 9261 onward). | **Move** to the one hook/component that installs each effect and add cleanup tests. | These comments often explain listener ordering, capture, passive mode, and z-index. They are valuable only beside a single authoritative lifecycle owner. Remove duplicate statements once `Game.tsx` infrastructure owns the effect. | **Confirmed:** current `document`/`window` calls and portals. |
| “Redux only; no mock” source-of-truth comments (3409–3411, 3648–3650, 5250–5253, 5931–5940). | **Keep co-located during migration; move** to the view-model/command adapter boundary afterward. | They correct stale transitional comments and state an important ownership invariant. Consolidate to one module-level statement plus selector/rollback tests rather than repeating it four times. | **Confirmed.** |
| “Legacy slot-bound shims” around 4472–4477. | **Update and move**, not remove yet. | The shims still participate in slot/drop calculation. Rename/document them by the behavior they preserve and delete only with the old layout caller. “Legacy” alone is not evidence of dead code. | **Confirmed:** current references in PlayerBox. |
| `detectDropTarget` and `applyMove` branch commentary (4966–5389). | **Move** to DnD collision policy and zone-command tests; keep non-obvious sentinels co-located. | The comments capture popup precedence, cross-player gifts, hidden-zone IDs, same-zone no-ops, and coordinate packing. These are high-value invariants that must survive extraction. DOM-query implementation narration can be removed after DnD droppables replace it. | **Confirmed** for current branches. Server-internal explanations are **Unverified** where not represented by Webatrice/Sockatrice tests. |
| `receiveBattlefieldCards` no-op explanation (5539–5545). | **Remove with the no-op API**, after moving the Redux source-of-truth statement to the adapter. | Keeping a documented no-op public contract encourages new callers and obscures actual state ownership. | **Confirmed.** |
| Shortcut comments with relative “above/below/line” references (3657–4370 and render handlers). | **Move and update** to symbol/test references in `useGameShortcuts`. | The priority/input guards are useful; positional references will break immediately on extraction. Use named operations and tests instead. | **Confirmed.** |
| Move-top-until state-machine comments (6106–6237). | **Move** to `useMoveTopUntil.ts` and its store-transition tests. | They describe one cohesive asynchronous workflow and should remain beside it rather than inside the seat renderer. | **Confirmed** for current logic; exact Cockatrice parity is **Unverified**. |
| Render-local hand orientation, library positions, popup drop routing, selection batching, owner gating, and drag-ghost comments (approximately 9193–11022). | **Move by subject** to CardSlot, ZoneViewDialog, context-menu actions, command ports, and DnD tests. | These are mostly valuable regression explanations. Do not copy the entire narrative into `PlayerBoard`; move each to the smallest owner. The hand orientation gate at 9239–9246 and library positional explanation at 9605–9622 are examples of comments worth preserving. | **Confirmed** for current branches. Upstream source citations remain **Unverified**. |
| Disabled/deferred menu behavior, such as opponent “Set aside cards…” around 10052–10055 and zone-view multi-select around 10631–10638. | **Update and move** to a named known-gap subsection or issue reference; keep a short local disabled-state reason only while the item renders. | These comments describe consciously incomplete behavior rather than dead code. Their desktop-parity claim must not be read as implemented parity. After menu convergence, either implement under a separate decision or keep explicitly disabled with coverage. | **Confirmed** that the current branches are disabled/deferred; protocol necessity and exact desktop behavior are **Unverified**. |

### Documentation rules during implementation

- A protocol sentinel belongs beside the one command adapter and in a focused assertion.
- A visual invariant belongs beside the leaf/layout function and in a component/numeric test.
- A cross-owner architectural rationale belongs in this plan or a maintained architecture document, not copied across components.
- Upstream file/line citations should be updated to a stable symbol or commit when verified. Until then, preserve them as leads labeled `Unverified`, not as proof.
- Delete comments about a compatibility façade in the same phase that deletes the façade.

## 8. Incremental implementation sequence

Each phase should be independently reviewable and revertible. No phase mixes a state-owner change with a visual redesign or protocol change.

### Phase 0 — establish a behavior baseline

1. Add `features/game/components/PlayerBox/PlayerBox.characterization.spec.tsx` (**new**) around the current public props/DOM and `features/game/components/ui/GameBoardCell/GameBoardCell.spec.tsx` (**new**) around state projection and command callbacks.
2. Add stable semantic test IDs/roles only where current DOM cannot be driven. That is test instrumentation, not a layout redesign.
3. Replace the false coverage comments in `Game.spec.tsx`, `Game.dragdrop.spec.tsx`, and `Game.orchestration.spec.tsx`. Do not merely unskip tests that target DOM that no longer exists; port each behavior to current anchors first.
4. Record the current scoped lint/typecheck/test baseline. The diagnostic review run already confirms three `TopBar` dependency errors and many unrelated style errors in touched hotspot files; phases must introduce no new errors and should leave every newly created file clean.

Gate: tests prove representative own/opponent/spectator seats, current menu/dialog routes, selection/bulk operations, drag/drop destinations, global cleanup, hidden zones, and at least one current E2E bulk action before stateful extraction begins.

### Phase 1 — repair cross-feature data ownership

1. Move `cardLookup.ts` to PB-06 with the same exports and tests. Redirect game consumers first, then deck consumers, then remove the transitional feature re-export.
2. Move the Cockatrice deck document/metadata codec and shared document types per DP-01; move format values per DP-02. Keep hydrated editor-only types in the deck feature.
3. Redirect `GameLobby` and `GameBoardCell` to root APIs. No protocol request or parsed output changes in this phase.
4. Update path-specific comments in Dexie schema/search/Card modules.

Gate: existing codec fixtures are byte-for-byte equivalent; card lookup results/cache behavior match; a scoped import search finds no `features/game/**` import from `features/decks/**`.

### Phase 2 — repair shell/page-chrome ownership

1. Move `TopBar` to `feature-wrappers/layout` (TB-01).
2. Extract shell-tab and route-persistence policies (TB-02/TB-03) without changing storage keys.
3. Move the two browser settings hooks to root hooks (TB-04), retaining exports.
4. Introduce `ShellTabLifecycleContext` and inject a deck cleanup adapter from `AppShell` (TB-05). Keep the wrapper’s operation semantic (`identity changed`/`tab closed`), not deck-specific.
5. Delete the old root-component file only after `Layout` and tests import the wrapper path.

Gate: the three current TopBar boundary errors disappear; login/logout, route restoration, sticky tabs, tab close, game settings, and deck cache cleanup tests pass.

### Phase 3 — create the seat model and command seam

1. Add PB-01 interfaces.
2. Extract `usePlayerSeatViewModel` (PB-02) with no render changes.
3. Extract grouped command hooks (PB-03 through PB-05). Initially adapt their methods back into the current flat `PlayerBox` props so JSX is unchanged.
4. Remove the three ignored `GameBoardCell` callback props only after a focused `Game` composition test proves equivalent game-level handlers are active.
5. Keep optimistic Datatrice dispatch/rollback in the zone command hook. Do not add a Webatrice copy of zone state.

Gate: `GameBoardCell` becomes a small adapter/composer; command-shape and rollback tests pass; current PlayerBox characterization and E2E tests remain unchanged.

### Phase 4 — extract pure policies

1. Extract card placement with both current policies (PB-07); do not resolve their disagreement here.
2. Compare and move battlefield pixel layout/stack logic (PB-08), retaining existing `gridMath` as the wire-grid owner.
3. Extract menu models/related actions (PB-09), P/T/life expressions (PB-11), and zone sorting (part of PB-13).
4. Replace duplicate counter colors with the existing `CardSlot` owner.

Gate: table/golden numeric tests demonstrate identical outputs at the old and new call sites. Target modules do not import `PlayerBox`.

### Phase 5 — converge selection, preview, shortcuts, and DnD

Perform one subsystem per pull request in this order:

1. Merge preview/hover providers into the existing preview owner (PB-19).
2. Route PlayerBox shortcut operations through `useGameShortcuts` while the façade still provides current semantic commands.
3. Move selection to the existing game-level owner (PB-15), then delete `selectionOwner.ts` after a zero-caller search.
4. Extend existing DnD data/collision logic for every current PlayerBox source/destination (PB-16). Switch one zone at a time: hand/stack reorder, visible piles, battlefield, hidden library/sideboard, incoming lent-zone dialog.
5. Remove each corresponding global pointer/query-selector branch immediately after its route is covered by DnD, so two handlers never dispatch the same move.

Gate per subphase: current characterization remains green; a listener/portal cleanup test proves no duplicate global handler; request spies show exactly one command per gesture (or the intentional bulk command set).

### Phase 6 — converge menus, prompts, and zone dialogs

1. Split `useGameDialogs` behind its façade (UG-01). This is organizational and should not move its instantiation.
2. Switch PlayerBox card-menu rendering to the existing `CardContextMenu` model/renderer (PB-09/PB-10), first own battlefield, then opponent, stack, grave, and exile.
3. Route numeric/text operations through `useGameDialogs` and the existing root `PromptDialog`; switch `CreateTokenModal` to `CreateTokenDialog` (PB-12). Move one modal at a time and delete its local state/key listener in the same change.
4. Merge library/reveal/pile behavior into `ZoneViewDialog` (PB-13); move incoming reveal to its intended dialog directory (PB-14).
5. Extract the move-top-until workflow (PB-17) once zone command/dialog ports are stable.

Gate per subphase: exact menu tree snapshots; prompt defaults/validation/cancel; portal z-order; multiple-zone-view and shuffle/clear behavior; no duplicate menu/dialog visible; no new command payload.

### Phase 7 — converge leaf rendering and the seat shell

1. Move card visuals to `CardSlot` and the one scale/preview owner (PB-18/PB-19).
2. Switch PlayerBox regions to the existing `PlayerInfoPanel`, `HandZone`, `ZoneStack`, `StackColumn`, and `Battlefield` one at a time (PB-20).
3. Change `PlayerBoard` to consume `PlayerBoardModel` plus grouped commands/contexts.
4. Reduce `PlayerBox` to a temporary adapter rendering `PlayerBoard`; preserve current CSS geometry and instrumentation.

Gate per region: focused component tests, current DOM behavior tests, visual snapshots at 1/2/3/4-player layouts, and E2E bulk/menu/drag flows.

### Phase 8 — remove compatibility and mock paths

1. Confirm all live zone/card metadata comes from Datatrice plus the root card catalog.
2. Remove the no-op `receiveBattlefieldCards`, mock deck persistence/writes, copied mock types, foreign DnD registry, duplicate providers, unused PlayerBox callbacks, and superseded comments.
3. Delete `PlayerBox.tsx` and remaining sibling files only after `rg` shows no import/caller and coverage has moved to target owners.
4. Re-enable or replace every skipped game/integration suite named in Phase 0. A test may remain skipped only with a current external blocker and owner.

Gate: `GameBoardCell` renders `PlayerBoard` directly; no `components/PlayerBox` import remains; no game-to-decks import remains; full unit/integration/E2E gates pass.

### Phase 9 — address the remaining hotspots

1. Extract `DeckEditor` in DE-01 through DE-06 behind its unchanged route export.
2. Extract `Decks` in DL-01 through DL-04 behind its unchanged route export.
3. Finish any remaining `useGameDialogs` domain split that was not needed for PlayerBox convergence.
4. Investigate feature-name-aware boundary enforcement for the installed `eslint-plugin-boundaries` version; add the rule only with a fixture proving game-to-decks fails and same-feature imports pass.

Gate: route-level behavior and public feature barrels remain stable; all new modules conform to the intended boundary directions; no new cross-feature import is possible without a failing check.

## 9. Tests and validation

### Required behavior matrix

| Contract | Minimum focused coverage before movement | Target coverage after movement | Relevant phase |
|---|---|---|---|
| State ownership and seat projection | Current `GameBoardCell` renders real hand/table/stack/grave/exile/revealed deck/sideboard props; hidden count is authoritative; spectator/opponent hand stays secret. | `usePlayerSeatViewModel.spec.tsx` with Datatrice fixtures and no mock deck state. | 0, 3, 8 |
| Battlefield coordinates | Pack/unpack `x = column * 3 + subposition`; row/orientation/inversion; full stack; nearest slot; attachments. | `gridMath.spec.ts`, `battlefieldLayout.spec.ts`, `cardPlacement.spec.ts`, existing Battlefield specs. | 0, 4, 7 |
| Placement policy divergence | Current type-line and CardDTO paths for land/creature/other/spell. | Both named policies asserted independently; parity decision gets a separate behavior-change review if ever unified. | 0, 4 |
| Drag threshold and click safety | Release below four pixels does not move in current PlayerBox; click/double-click does not reorder. | DnD/gesture tests for chosen preserved threshold; arrow threshold remains separately asserted until decided. | 0, 5 |
| Drop destinations | Hand/stack/popup reorder; board slot; visible piles; library dialog top/bottom position; sideboard append; same-zone no-op. | `useGameDnd.spec.ts` plus command-port request tests and pointer E2E. | 0, 3, 5 |
| Hidden-zone protocol | Deck top uses positional `cardId=0`; bottom/position semantics; random reveal `-2`; all/target reveal sentinels; one-index prompt conversion; hidden count not inferred from visible cards. | Command-port specs with exact Sockatrice request objects and integration store events. | 0, 3, 6 |
| Cross-player ownership | Gift to another battlefield; cross-player attachment renders under parent but commands source owner; lent-zone drag carries lender ID; opponent menu cannot mutate forbidden state. | View-model, DnD, command, Battlefield, and menu specs; judge/lender integration tests. | 0, 3, 5, 6 |
| Selection/bulk | One owner across seats; zone-scoped marquee; additive/clear; effective targets; selection snapshot before prompt; batch/per-card command distinctions. | Existing selection/DnD specs expanded with current seat DOM and menu actions. | 0, 5, 6 |
| Menu parity | Own/opponent/face-down/attached/stack/pile trees; order/dividers/hints; counter colors/IDs; token/transform related cards; disabled known gaps. | Pure menu snapshots plus renderer keyboard/pointer specs. | 0, 4, 6 |
| Dialogs and portals | Escape/outside behavior; initial values/validation; only top interaction layer active; menu above zone view; popup drop routing; shuffle/clear on close. | `PromptDialog`, split dialog hooks, `ZoneViewDialog`, incoming reveal, and Game portal-host specs. | 0, 6 |
| Browser effects | Wheel `passive:false`; cursor restoration; document/window listener cleanup; no handler multiplication across rerender/unmount; localStorage exceptions. | Hook tests with listener spies and wrapper browser-persistence tests. | 0, 2, 5, 6 |
| Metadata | Dexie-first/cache/Scryfall fallback; batch dedupe; printing/provider/faces/related tokens; unknown fallback; no request storm. | Root `cardCatalog.spec.ts`, view-model tests, CardSlot image tests. | 1, 3, 7 |
| Move-top-until | Start/filter/stop, Redux update sequence, empty deck, cancel/unmount, no duplicate dispatch. | `useMoveTopUntil.spec.tsx` with fake timers/store updates and command spy. | 6 |
| Shell ownership | TopBar route/tab/user behavior, settings, last route, cache cleanup port. | Wrapper/service/hook tests plus scoped boundary lint. | 2 |
| Deck hotspots | Existing route behavior, parser/import, editor mutations, search query, printing choice, list caching/view mode. | Focused extracted component/hook/pure specs plus unchanged route specs. | 9 |

### Test-suite repair

The following current evidence must be corrected as part of Phase 0/8:

- [Game.dragdrop.spec.tsx](../packages/webatrice/src/features/game/Game.dragdrop.spec.tsx#L1) is `describe.skip` and says PlayerBox card/zone specs cover DnD; no spec/test file exists in the `components/PlayerBox` directory after a scoped filename search. **Missing.**
- [Game.orchestration.spec.tsx](../packages/webatrice/src/features/game/Game.orchestration.spec.tsx#L1) is `describe.skip` after current DOM anchors disappeared. **Confirmed.**
- [Game.spec.tsx](../packages/webatrice/src/features/game/Game.spec.tsx#L103) says behavior is covered by “PlayerBox’s own suite”; that suite was not found. **Missing.**
- [library-view.spec.tsx](../packages/webatrice/integration/src/features/game/library-view.spec.tsx#L1) and [judge-override.spec.tsx](../packages/webatrice/integration/src/features/game/judge-override.spec.tsx#L1) are skipped because of the PlayerBox rewrite. **Confirmed.**
- [bulk-card-actions.spec.ts](../packages/webatrice/e2e/specs/bulk-card-actions.spec.ts#L1) is a live E2E path and should remain a release gate. **Confirmed.**

The target is not to preserve old test file names. It is to restore their behavioral intent against the authoritative owners and remove false supersession comments.

### Validation commands for implementation phases

Run from `packages/webatrice` unless stated otherwise:

```text
npm run typecheck
npm run lint
npm run test -- <focused spec paths>
npm run test
npm run test:integration
npm run build
npm run test:e2e:run -- <focused Playwright spec>
```

Use `npm run golden` once touched-file lint is clean and the repository lint baseline permits it; E2E additionally requires its documented Servatrice environment. Because current hotspot files already produce many lint errors, each pull request should save a machine-readable baseline and require: no new errors repository-wide, zero errors in new files, and elimination of the specific boundary errors it addresses. Do not hide regressions by increasing ignore scopes.

After each move, also run scoped dependency/caller checks, for example:

```text
rg -n "features/decks|\.\./decks" src/features/game
rg -n "components/PlayerBox" src integration e2e
rg -n "receiveBattlefieldCards|mockDeckStore|useSelectionOwner|useForeignDrag" src
```

Expected final result: all three searches return no live imports/callers (documentation/test descriptions may be deliberately updated rather than blindly removed).

## 10. Risks, trade-offs, out-of-scope dependencies, and unresolved decisions

### Principal risks and mitigations

| Risk | Why it is real | Mitigation | Evidence |
|---|---|---|---|
| A “cleanup” changes Cockatrice placement behavior. | PlayerBox’s type-line heuristic and the tested CardDTO `tablerow` path disagree for creature/other rows. | Name and test both policies before movement. Resolve only in a separately reviewed parity change with authoritative evidence. | **Confirmed** divergence; upstream intended policy **Unverified**. |
| Gesture consolidation changes click/drag/arrow behavior. | PlayerBox uses four pixels for drop activation; existing right-arrow tests name eight pixels. Global capture/listener ordering also differs. | Characterize each gesture; migrate one source/destination; assert exactly one command and cleanup; choose a common threshold only explicitly. | **Confirmed.** |
| Structured “old” components do not yet contain all current PlayerBox behavior. | Existing owners have focused tests, but current PlayerBox added richer menus, zone sorting, DFC/token behavior, layout, and hidden-zone DnD. | Enrich target owners behind models/ports; never replace current render with an older component without a parity matrix and current screenshots. | **Confirmed** by side-by-side symbol/test inventory. |
| Local state changes lifecycle when lifted to `Game.tsx`. | Selection, menus, dialogs, preview, and DnD currently exist per PlayerBox or in module singletons while structured owners are game-level. | Treat each as state relocation, test unmount/seat changes/multiple players, and keep a compatibility façade until the subsystem is sole owner. | **Confirmed.** |
| Mock-deck removal drops metadata or library-search features. | Zones are real Redux state, but `cards`/`getPickedMockDeck` still supply metadata enrichment. | Migrate metadata to the root catalog/view-model first; assert printing, sorting/grouping, and lookup fallback before deleting storage/types. | **Confirmed.** |
| Protocol sentinels are normalized away by a “clean” interface. | Deck top, random reveal, all-target reveal, sideboard append, and library insertion use non-obvious numeric conventions. | Semantic view operations; exact translation only in command adapters; request-object tests at the boundary. | **Confirmed** in current branches and game instructions. Exact server-internal rationale sometimes **Unverified**. |
| Browser layer behavior regresses. | Current code uses portals, z-index, document/window handlers, passive wheel listeners, body cursor mutation, DOM queries, and multiple popup layers. | Per-effect cleanup tests, portal-layer interaction tests, and pointer E2E before deleting the old branch. | **Confirmed.** |
| Card-catalog movement changes cache lifetime or fetch behavior. | The current module has module/session caches and Dexie/Scryfall fallback. A rewrite during movement could change performance and unknown-card behavior. | Move intact first with exports retained; rename/redesign only in a later phase with cache tests. | **Confirmed.** |
| Boundary enforcement still misses future cross-feature imports. | All features share one configured boundary element and current game-to-decks imports were not reported. | Correct imports now; separately verify installed plugin capture rules and add a failing fixture before config change. | **Confirmed** gap; exact rule syntax **Unverified**. |
| Existing lint debt obscures phase regressions. | The scoped review run reported the three boundary errors plus extensive pre-existing formatting/style errors in hotspot files. | Baseline comparisons, zero errors in new files, touched-file cleanup, and no ignore expansion. | **Confirmed.** |
| Move-top-until or optimistic moves race Redux updates. | The workflow observes server/store changes while dispatching sequential commands; current move code has optimistic apply/rollback. | Fake-timer/store-event characterization and one workflow owner using the grouped command port. | **Inferred** risk from confirmed state machine and optimistic path. |

### Trade-offs

- Grouped command hooks add interfaces, but they prevent a flat callback bag and keep Sockatrice payload translation in one boundary. Do not split them further unless a group develops a distinct dependency/lifecycle.
- A Webatrice presentation model duplicates a small amount of shape from `ServerInfo_Card`, but it prevents render components from depending on protocol details and makes hidden/cross-owner states explicit. Where no adaptation is needed, keep `ServerInfo_Card` as a referenced field rather than copying every property.
- Retaining `PlayerBox` as a façade temporarily means short-lived duplication. The one-way rule—façade imports targets, targets never import façade—and deletion gates keep it temporary.
- Moving the full `.cod` codec to a root service is larger than adding a one-off `readDeckName` helper, but it eliminates all game-to-decks parsing/type imports without duplicating XML semantics. Hydrated editor state still remains feature-owned.
- Reusing `PromptDialog` reduces modal implementations, but visual/keyboard behavior must win over reuse. A specifically named feature dialog is preferable if characterization proves the generic prompt cannot preserve behavior.

### Out of scope

- No Datatrice refactor is proposed. Its normalized game state and selectors remain the source; Webatrice adapter hooks consume them.
- No Sockatrice refactor is proposed. Existing request APIs remain the protocol boundary. If a characterization test reveals that a required semantic operation cannot be expressed without a new Sockatrice API, record that as an out-of-scope dependency and stop that extraction rather than recreating transport behavior in Webatrice.
- No Cockatrice desktop/server source audit was performed outside the repository material reviewed here. Embedded `*.cpp` file/line references are useful leads but remain **Unverified** until checked against a pinned upstream revision.
- Disabled/deferred parity items such as opponent “Set aside cards…” and zone-view multi-select are not implemented by this responsibility refactor.
- CSS redesign, accessibility redesign, and gameplay behavior changes are separate work. Existing accessibility defects may be documented by characterization but should not be mixed into ownership moves unless necessary to create stable test anchors.

### Unresolved decisions

| Decision | Current evidence | Required resolution point |
|---|---|---|
| Which table-row policy is authoritative for type-line placement? | PlayerBox maps creature to row value 2; `playCard.ts`/tests use `CardDTO.tablerow=1` for creature and 2 for other. **Confirmed.** Upstream intended mapping **Unverified.** | Before merging the two named functions after Phase 4; not required to extract them. |
| Should card-drop and right-arrow gestures use one movement threshold? | Current values are four and eight pixels. **Confirmed.** | During Phase 5 after independent behavior tests and UX/parity evidence. Preserve current per-gesture values by default. |
| Can every bespoke PlayerBox prompt use root `PromptDialog` without visible/keyboard drift? | Existing generic prompt and game dialog state cover many operations; bespoke modals install their own listeners/styles. **Inferred** reuse, exact equivalence **Unverified.** | One modal at a time in Phase 6; create a named dialog only when a characterization fails. |
| Should `PlayerBoardModel` embed `ServerInfo_Card` or copy a narrow visual shape? | Current structured components use server cards; PlayerBox uses copied `HandCard`/`BattlefieldCard`. **Confirmed.** | PB-01 design review. Prefer a narrow wrapper with original server card retained where it avoids lossy mapping. |
| What semantic events should `ShellTabLifecycleContext` expose? | TopBar currently clears two deck caches during shell lifecycle, creating a forbidden dependency. **Confirmed.** | Phase 2 contract test. Prefer identity/tab events; keep cache names in the AppShell adapter only. |
| How should feature-to-feature imports be enforced? | Current boundary element does not distinguish feature names. **Confirmed.** Exact installed-plugin capture configuration **Unverified.** | Phase 9 spike with pass/fail fixtures; do not guess configuration syntax in the refactor PR. |
| Can PlayerBox’s pixel layout be represented entirely by existing `gridMath` constants? | Both modules contain overlapping but differently scaled constants. **Confirmed.** Equivalence **Unverified.** | Phase 4 comparison tests. Keep a separate `battlefieldLayout.ts` for genuinely pixel/scale-specific behavior. |
| Can a pure spectator drag cards from a lent incoming-reveal dialog? | The current foreign registry becomes a no-op without a local PlayerBox. **Confirmed** by implementation; desired behavior **Unverified.** | Add a Phase 0 test and consult parity requirements before PB-14/PB-16. |

### Completion criteria for the eventual refactor

The refactor is complete only when:

1. `GameBoardCell` is an adapter over Datatrice state and grouped WebClient command ports, and `PlayerBoard` is the seat composition owner.
2. There is one authoritative owner each for battlefield grid/layout, card rendering, selection, DnD, shortcuts, card menus, zone views, preview, and game dialogs.
3. No game module imports deck-feature internals, and page chrome imports no feature internals.
4. The mock deck bridge, no-op imperative handle, module selection singleton, foreign PlayerBox DnD registry, duplicate providers, and `PlayerBox` façade are gone after zero-caller searches.
5. Protocol sentinels, Cockatrice-parity behavior, Datatrice ownership, optimistic rollback, and browser interactions are guarded by focused tests and the repaired integration/E2E suite.
6. Useful inline parity documentation lives beside its authoritative owner; contradicted and duplicate comments have been removed or updated.
