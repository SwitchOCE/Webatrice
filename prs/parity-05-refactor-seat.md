# refactor(game): split PlayerBox into the seat model and existing game owners

## Summary

- Behaviour-preserving refactor of the 11k-line `PlayerBox` game seat, following the phases in
  `docs/webatrice-solid-refactor-plan.md` §8. Each stage below is a run of small, reviewable commits.
- Stage 1 puts a characterization barrier around the seat before any state moves (Phase 0).
- Stage 1 also removes every `features/game → features/decks` import by lifting the shared card
  catalog and the Cockatrice `.cod` codec to root owners (Phase 1, DP-01 / DP-02 / PB-06).
- `eslint.boundaries.mjs` now treats each feature folder as its own element, so any import from
  one feature into another is a lint error.
- Stage 2 builds the seat model and grouped command ports, and moves the pure policies to their owners
  (Phases 3–4).
- Stage 3 converges selection, card preview, shortcuts and drag-and-drop on the existing game-level
  owners (Phase 5). It deletes PlayerBox's selection singleton and its own drag system.
- Stages 1–2 change one visual (counter colours). Stage 3 deliberately fixes opponent-card drags, makes
  three shortcuts rebindable and moves the drop preview; see its notes.

## Stages

### Stage 1 — Phase 0 (characterization barrier) and Phase 1 (cross-feature data ownership)

Commits (oldest first):

1. `test(game): characterize the PlayerBox seat and GameBoardCell adapter`
   - `components/PlayerBox/PlayerBox.characterization.spec.tsx` (34 tests). Renders the real seat
     through `<Game />` with Redux fixtures and asserts on the wire (`webClient.request.game.*`), so
     it survives later re-plumbing. Covers:
     - own, opponent and spectator seats;
     - hidden zones: library and opponent-hand counts come from `cardCount`;
     - the full menu trees: library, graveyard/exile, hand, own/opponent card, own/opponent
       battlefield;
     - menu → command and menu → dialog routes;
     - selection: a sub-threshold click selects, ctrl-click adds, moves are batched while taps go
       one per card;
     - drag destinations: battlefield → pile, library pile (`cardId 0`), the four-pixel threshold,
       same-zone no-ops, hand → battlefield sub-slot, hand reorder, hand → stack index,
       sideboard dump + append (`x = -1`);
     - window/document listener cleanup, the grabbing cursor, and non-passive wheel listeners.
   - `components/ui/GameBoardCell/GameBoardCell.spec.tsx` (30 tests). Replaces PlayerBox with a
     prop probe and pins:
     - the state projection: identity, counters, mana pips, wire x → column/sub-slot, cross-player
       attachments keeping their owner, revealed snapshots, the opponent hand kept secret;
     - the exact request, optimistic dispatch and rollback behind every callback (move sub-slot
       resolution and gifts, tap, P/T, counters, reveal sentinels, attach/unattach field omission,
       arrows, peek, clone, create-token row choice);
     - the deck-editor link that parses the game deck document.
   - Shared fixtures live in `features/game/__test-utils__/seatFixtures.ts`. The mock WebClient
     gains `bulkSetCardCounterEntries`.
2. `test(game): port the skipped Game drag/orchestration suites to the PlayerBox seat`
   - `Game.dragdrop.spec.tsx` and `Game.orchestration.spec.tsx` were `describe.skip` stubs that
     claimed coverage which did not exist. Their behaviour now runs against current anchors:
     - gift onto another battlefield; lent-library drags carry the lender id and land only on a
       battlefield;
     - roll die, kick, choose-size mulligan (relative size and range rejection), draw arrow to a
       card or a player, concede, sideboard view, game info.
   - The false comments in `Game.spec.tsx` are replaced by real per-seat mirroring and pile-view
     checks.
3. `refactor(webatrice): move card lookup to a root card-catalog service`
   - `features/decks/cardLookup.ts` → `services/cards/cardCatalog.ts` (`git mv`, same exports),
     exported through `@app/services`. The decks barrel stops re-exporting it.
   - New `cardCatalog.spec.ts` (11 tests): unknown fallback, cards.xml + Scryfall merge, cache
     read/write and combo-piece cleanup, batched requests with name dedupe, per-name retry and its
     50-name request-storm cap, session memoization, printings search.
4. `refactor(webatrice): lift the Cockatrice deck document codec and formats to root owners`
   - `cod.ts` / `meta.ts` → `services/decks/cockatriceDeckDocument.ts` /
     `cockatriceDeckMetadata.ts`.
   - Document types → `types/cockatriceDeck.ts`; format values and predicates →
     `types/deckFormat.ts` (new table spec).
   - `DeckCard` and `HydratedDeck` stay in the deck feature. `serializeCod` types its cards as
     `ParsedCard`, the only fields it ever wrote.
   - The codec specs moved with byte-identical fixtures; only the imports and one type annotation
     differ (`git diff -M` shows 10 and 5 changed lines).
5. `build(webatrice): make feature-to-feature imports a boundaries error`
   - The `features` element is now `src/features/*` with `capture: ['feature']`.
   - Verified with a deliberate probe in `features/game`, since removed:
     - `@app/features/decks` and `../decks/hydrate` imports both failed with
       `no rule allowing dependencies from … feature "game" to … feature "decks"`;
     - a `feature-wrappers` import and a same-feature import stayed clean.
   - `webatrice.instructions.md` states the rule.
6. `chore(changeset): note the game seat refactor` — `@cockatrice/webatrice` patch.

Gate checks:

- `rg "features/decks|\.\./decks" src/features/game` → no imports.
- The whole `src` tree lints clean under the stricter rule.

### Stage 2 — Phase 3 (seat model and command seam) and Phase 4 (pure policies)

`GameBoardCell` goes from 1,974 lines to a 156-line composer, and `PlayerBox` from 11,288 to
10,604. `PlayerBox`'s props and JSX are unchanged: a compatibility adapter feeds it the same
flat props.

Commits (oldest first):

1. `refactor(game): move the seat battlefield layout beside gridMath` (PB-08)
   - `PlayerBox/gameBattlefield.ts` → `battlefield/Battlefield/battlefieldLayout.ts`, plus the
     spell-stack layout (`layoutStackPile`) and the 72 × 102 base card size.
   - Its row count and sub-slot limit now come from `gridMath`, which stays the only owner
     of wire packing. Five fraction-based helpers with no callers are dropped.
   - Golden spec: scales, sub-slots, attachment footprints, minimum width. Pointer snapping
     is checked against `gridMath.mapToGridX` and agrees when both see the same stack widths.
2. `refactor(game): add the PlayerBoard seat model and grouped command ports` (PB-01)
   - `ui/PlayerBoard/playerBoard.types.ts` defines:
     - `PlayerBoardModel`: seat, seven zones, counters, permissions;
     - `PlayerBoardCommands`: zone, card, counter and target ports.
   - Reveals are semantic (`'all'` or a player; `'zone'`, `'random'` or `{ top }`).
   - `PlayerBox`'s `HandCard` / `BattlefieldCard` become aliases of the seat card models.
   - Type-level spec.
3. `refactor(game): project the seat through usePlayerSeatViewModel` (PB-02)
   - All selectors and projections move into the hook. Each zone is memoized separately.
   - `usePlayerBoxProps.ts` spreads the model back into `PlayerBox` props.
   - Spec: identity and placeholders, hidden counts, opponent hand secrecy, pile order,
     wire x decoding, attachments in both directions, dump snapshots, counters.
4. `refactor(game): split GameBoardCell's commands into grouped seat ports` (PB-03..05)
   - New hooks: `usePlayerZoneCommands`, `usePlayerCardCommands`,
     `usePlayerCounterCommands`, `usePlayerTargetCommands`, and `useOpenDeckInEditor` for
     the deck-editor link.
   - The optimistic move, its rollback and the free-sub-slot resolution stay in the zone
     port. The sub-slot search is now the pure, tested `resolveBattlefieldDropX`.
   - Only the zone port knows the reveal sentinels (omitted `player_id`, `-2`, `[0]`).
   - `usePlayerBoxCommandProps` adapts the ports back to the flat callbacks.
   - `GameBoardCell.spec.tsx` passes unchanged, and each port has its own request-shape and
     rollback spec.
5. `refactor(game): drop the callbacks Game passed to GameBoardCell and never used`
   - `Game.seatComposition.spec.tsx` was written first and passes before and after the
     removal. It covers:
     - the battlefield and hand right-clicks open the seat's menus, never the game-level
       `PlayerContextMenu` / `HandContextMenu`;
     - an arrow resolved on a player sends exactly one `createArrow`.
6. `refactor(game): name both battlefield row policies in cardPlacement` (PB-07)
   - Both policies are named and kept separate: `legacyTableRowFromTypeLine` (PlayerBox,
     creature = row 2) and `placementFromCardDatabaseRow` / `tokenGridYFromCardDatabaseRow`
     (card database, creature = row 1).
   - The spec pins the creature disagreement. Y-inversion stays with `applyInvertY` at the
     caller, applied once.
   - A new `playCard` golden table passes against both the old and the new `playCard.ts`.
7. `refactor(game): move the P/T and life expression policies to their owners` (PB-11)
   - `CardContextMenu/cardAttributeEdits.ts` and `PlayerInfoPanel/lifeExpression.ts`, moved
     unchanged, with table specs.
8. `refactor(game): move zone-view sorting to ZoneViewDialog on a catalog-shaped card` (PB-13,
   policy part)
   - `cardListSort.ts` → `dialogs/ZoneViewDialog/zoneViewSort.ts`. It is typed on
     `ZoneViewCardMetadata` instead of the mock `DeckCard`.
   - The type buckets move in from `mockTypes.ts`.
9. `refactor(game): take seat counter colours from the CardSlot owner` (Phase 4, step 4)
   - The two duplicate Tailwind palettes are removed in favour of `counterColorForId`. See notes.
10. `refactor(game): move the card menu model and related-card actions out of PlayerBox` (PB-09)
    - `CardContextMenu/cardContextMenu.model.ts` and `relatedCardActions.ts`.
    - The function bodies are byte-identical to the originals (checked by script). Specs
      pin the full menu tree, the action id behind every shortcut hint, the counter swatches,
      the token and transform items.
11. `build(webatrice): forbid PlayerBox imports from the extracted seat owners`
    - A `no-restricted-imports` override enforces the plan's one-way rule. Checked with a
      probe, since removed.
12. `chore(changeset): note the seat model, command ports and counter colours`

Gate checks:

- The new owners import nothing from `components/PlayerBox`. Lint now enforces this.
- The Stage 1 characterization specs are unmodified and green at every commit:
  `PlayerBox.characterization`, `GameBoardCell`, `Game`, `Game.dragdrop`,
  `Game.orchestration`.

Testing (final commit, worktree root; Vitest with `--maxWorkers=2`):

- `npx turbo run typecheck --concurrency=1`: pass.
- `npm run lint`: 0 errors in all 3 packages. The whole webatrice `src` tree is clean.
- Unit tests:
  - sockatrice: 33 / 604.
  - datatrice: 26 / 1083.
  - webatrice: **181 files / 1446 tests passed** (Stage 1 ended at 167 / 1271).
- Integration tests:
  - sockatrice: 16 / 146.
  - datatrice: 8 / 124.
  - webatrice: 33 passed + 2 skipped files, 132 passed + 2 skipped tests. These are the same
    pre-existing skips as Stage 1.
- E2E: `npm run test:e2e -w @cockatrice/webatrice` (default image, under the shared mutex), run once:
  **17 passed, 1 failed (6.2 min)**.
  - Every game spec passed in chromium, firefox and webkit, including the
    `bulk-card-actions.spec.ts` release gate.
  - The failure is webkit `app-boots.spec.ts`. Its console-error guard caught
    `WebSocket connection to 'wss://mtg.chickatrice.net/' failed ... error code 35`, which is the
    app's default auto-connect reaching an external public server from the sandboxed browser.
    No game code runs on that path, the same spec passed in chromium and firefox, and Stage 1's
    run of it was green. Not re-run, per the brief's one-run rule, since nothing was fixed.
  - The stack was torn down and the lock released.

Notes for reviewers (Stage 2):

- **One deliberate visible change: counter colours.** Counter badges, the card-menu swatches and
  the set-counter dialog used a Tailwind palette that existed only in `PlayerBox`. They now use
  desktop's `hsl(id × 60°, 59%, 70%)` from `CardSlot/counterColors.ts`, which the game
  instructions already document as the parity rule. The hue of A–F is unchanged.
- **`zone.move` still takes `Command_MoveCard` params.** `PlayerBox` builds them in about 40
  places (`applyMove` and the menus). A semantic `move(cards, destination)` would only
  round-trip back into the same shape until DnD convergence (Phase 5) moves that translation
  into the port. All other ports are semantic.
- **Life fallback.** Life deltas now fall back to 0 when the counter is missing from state at
  click time, like mana counters do. Before, life fell back to the last rendered value.
  Servatrice never deletes the life counter, so this cannot happen in play.
- **Pinned, not fixed:**
  - Card id 0 gets no "Transform into" item (`!sourceCardId`), but Servatrice numbers cards
    from 0 (`newCardId`).
  - Under the P/T sort, two non-creatures compare as NaN and keep their input order instead
    of sorting by name.
  - Both are pinned in specs so a fix shows up as a deliberate test change.
- **Not in this stage:**
  - Menu rendering, prompts and zone dialogs stay in `PlayerBox` (Phase 6).
  - Selection and DnD stay there too (Phase 5).
  - The mock deck metadata path (`cards` prop, `mockDeckStore`) waits for Phase 8.
  - `PlayerBox`'s in-component slot and layout helpers (drop-slot search, display rows) read
    component state, so they move with the battlefield region in Phase 7.
  - The game-level player and hand menu handlers still exist in `useGameDialogs`; whether
    those menus survive is a Phase 6 decision.

### Stage 3 — Phase 5 (selection, preview, shortcuts and DnD converge on the game owners)

`PlayerBox` goes from 10,604 to 9,842 lines. It no longer owns a selection, a preview provider,
a key handler, a window pointer listener or a DOM drop hit-test. Each subsystem now has one game-level
owner, and `PlayerBox` only supplies what it still renders.

Commits (oldest first):

1. `refactor(game): make CardPreviewContext the one card-preview owner` (PB-19)
   - There were three preview owners: PlayerBox's `HoveredCardProvider` and `BigCardPreviewProvider`,
     and the structured `CardPreviewContext`, which nothing read.
   - Now there is one per-game store (`createCardPreviewStore`). It holds the hovered card, the
     keyboard-focused card (focus wins over hover) and the middle-click zoom. The payload is a
     presentation card (`PreviewCard`: printing, face image, P/T, annotation).
   - Publishers get stable actions and never subscribe. Hovering across the board re-renders only the
     sidebar, the zoom and the popup channel. Before, every seat card consumed a context value that was
     rebuilt on each hover.
   - `BigCardPreview` is now only a view. `hoveredCard.tsx` is deleted.
2. `refactor(game): route the seat's shortcuts through useGameShortcuts`
   - `useGameShortcuts` owns every game key binding.
   - The 45 seat-scoped actions (`SEAT_SHORTCUT_ACTIONS`) are registered once per game through the new
     `useShortcutGroup`. They run the operations the local seat publishes to `SeatShortcutsContext`.
   - The key is consumed only when a seat handled it, so a spectator's Ctrl+R still reloads the page.
   - The hard-coded Ctrl+M / Ctrl+L / Ctrl+R window listener is gone. Those keys are now rebindable
     `game.mulligan` / `game.setLife` / `game.removeLocalArrows`, with desktop's defaults (`Player/aMulligan`,
     `Player/aSet`, `Player/aRemoveLocalArrows`).
3. `refactor(game): make the seat selection a view of the game selection` (PB-15)
   - The seat reads and writes `useGameSelection`'s keys through `useSeatSelection` and the new
     `GameSelectionContext`, in the seat's `{ zone, ids }` shape.
   - A non-null set replaces the whole game selection, which is what claiming ownership did. Clearing a seat
     clears only that seat's cards.
   - Keys carry each card's real owner, so cross-player attachments resolve for game-level consumers.
   - `selectionOwner.ts` is deleted after a zero-caller search. So is the dead cross-seat
     "received selection" plumbing.
4. `refactor(game): share the optimistic Command_MoveCard path as useMoveCard`
   - The zone port's optimistic move moves unchanged into `GameBoardCell/useMoveCard.ts`, so the DnD
     coordinator sends through the same path instead of a second copy.
5. `refactor(game): drive seat hand and stack drags through useGameDnd` (PB-16)
   - Sets up the infrastructure every later zone uses:
     - `GamePointerSensor` replaces dnd-kit's `PointerSensor`. Each draggable picks its gesture through
       its data: structured leaves start on any motion; seat sources keep the four-pixel box (per axis, as
       PlayerBox measured it), and a release inside it is a click (`onRelease`). It listens on the window.
     - `seatDropPlan.ts` holds the seat drag data, the drop targets and the pure drop →
       `Command_MoveCard` plan that `applyMove` used to compute.
     - `useGameDnd` gets a seat layer. Seat zones are hit-tested at the pointer, highest priority first
       (a dialog over the board). The zone resolves the position from its own layout. The plan is sent
       through `useMoveCard`. The coordinator also owns the grabbing cursor and the active seat drag.
     - Every seat zone and dialog registers as a drop zone (`useSeatDropZone`), carrying the resolvers
       from `detectDropTarget`.
   - Hand and stack cards switch to the coordinator.
6. `… graveyard, exile and pile-view drags …`
7. `… battlefield drags …`
8. `… library and sideboard drags …`
   - Commits 6–8 switch one zone family each. A switched source never reaches the old listener, so two
     handlers never dispatch the same move.
9. `refactor(game): drag lent cards through useGameDnd and drop PlayerBox's drag system`
   - The lent-zone dialog registers its own seat source: the drag starts from the local seat, with the
     lender as the zone's owner. This replaces `foreignDragContext`.
   - With no source left on the old system, it goes: `DragState`, `beginDrag`, the window
     pointermove/pointerup effect, the cursor effect, `detectDropTarget` with its `querySelectorAll`
     battlefield scan, `applyMove`, the slot helpers, `wireZoneName`, the old ghost and
     `foreignDragContext.tsx`.
   - The battlefield drop preview now uses the drop's own resolver (`SeatDropPreview`).
10. `fix(game): only drag cards the local player may move, as desktop does` — the intentional fix
    pinned in Stage 1; see notes.
11. `chore(changeset): note the converged selection, preview, shortcuts and DnD`

Gate checks for each subphase:

- The Stage 1 characterization specs are unmodified and green at every commit (`PlayerBox.characterization`,
  `GameBoardCell`, `Game`, `Game.orchestration`), except one test in `Game.dragdrop`. That test pinned the
  opponent-drag gap, and commit 10 replaces it on purpose.
- Listener and portal cleanup is checked by:
  - `Game.shortcuts.spec`: the seats add no keydown listener; only the provider and the game's Escape
    handler listen.
  - `Game.seatDnd.spec`, for every converted source: during a drag, the window has exactly one
    pointermove and one pointerup listener (the sensor's). After the drop it has none, and the ghost
    portal and the grabbing cursor are gone.
  - The characterization listener test.
- One command per gesture, checked by request spies:
  - every `Game.seatDnd.spec` drag sends exactly one `moveCard`. A battlefield selection re-slotted on its own
    board sends one per card, which is the intentional set;
  - Ctrl+R sends one `deleteArrow` per own arrow. A second handler would double that.
- A mutation check confirmed the spectator lent-drag spec fails without its gate.
- New unit specs: `CardPreviewContext`, `SeatShortcutsContext`, `useShortcutGroup`, `useSeatSelection`,
  `gamePointerSensor`, `seatDropPlan`, and the `useGameDnd` seat layer (collision priority, plan dispatch,
  judge wrapping).

Testing (final commit, worktree root; Vitest with `--maxWorkers=2`):

- `npx turbo run typecheck --concurrency=1`: pass.
- `npm run lint`: 0 errors in all 3 packages.
- Unit tests:
  - sockatrice: 33 / 604.
  - datatrice: 26 / 1083.
  - webatrice: **190 files / 1520 tests passed** (Stage 2 ended at 181 / 1446).
- Integration tests:
  - sockatrice: 16 / 146.
  - datatrice: 8 / 124.
  - webatrice: 33 passed + 2 skipped files, 132 passed + 2 skipped tests (the same pre-existing skips).
- E2E: `npm run test:e2e -w @cockatrice/webatrice` (default image), run once under the shared mutex:
  **18 passed (5.9 min)**. That covers every game spec in chromium, firefox and webkit, including the
  `bulk-card-actions.spec.ts` release gate. The stack was torn down and the lock released.

Notes for reviewers (Stage 3):

- **Intentional fix: opponent drags.**
  - Desktop starts a card drag only when the owner is the local player or the user is a judge
    (`CardItem::mouseMoveEvent` → `getLocalOrJudge`).
  - Seat sources now take the seat's `computeCanAct`. On any other seat a press still selects, but never
    drags. Before, an opponent's card could be dropped on that opponent's pile, and the move was rejected.
  - A judge can drag any seat's cards. Those moves go through `Command_Judge` with the owner as target,
    like `PlayerActions::sendGameCommand`, and wait for the server rather than moving optimistically.
  - The pinned `Game.dragdrop` test is replaced by two specs: an opponent's card only selects, and a judge's
    drag sends one judge-wrapped move.
- **Other visible changes**, all in the changeset:
  - Ctrl+M / L / R are rebindable. The old listener also accepted Cmd on macOS; the new bindings are Ctrl
    only, like every other game shortcut.
  - The game-level Escape handler now also clears a seat selection.
  - The battlefield drop preview shows on whichever board the drag is over. Before, it showed only on the
    dragging seat's own board.
- **Threshold decision** (refactor plan, "Unresolved decisions"): kept per gesture, as the plan's default
  says. Seats keep 4 px per axis; structured leaves keep 0. Both now run on one sensor, so a future
  unification is a one-line change. The instructions file documents both.
- **Pure-spectator lent drag** (also an open question in the plan): a spectator is still offered no drag.
  Servatrice never lends to a spectator. A spec pins it.
- **`zone.move` still takes `Command_MoveCard` params.**
  - DnD now goes from a semantic drop target (`SeatDropTarget`) through the pure `planSeatMove`.
  - The about 40 remaining params callers are the menus, which move in Phase 6.
  - The battlefield sub-slot is still resolved once, in `useMoveCard`, so the plan asks for the stack column
    (`col * 3`), as PlayerBox's x was re-resolved there anyway.
- **Snapping:** a gift onto another board now snaps against that board's own column widths and scale,
  because the target seat resolves its own drops. Before, the dragging seat parsed the target's widths from a
  data attribute and used its own scale. A drop on the seat's own board is unchanged.
- The seat ghost is still PlayerBox's card visual, drawn through `SeatDragGhost`. Only that component
  re-renders while the pointer moves. Before, PlayerBox re-rendered on every move.
- **Not in this stage:** menus, prompts and zone dialogs (Phase 6); `PlayerBox`'s in-component layout
  helpers and leaf rendering (Phase 7); the mock deck path (Phase 8).

### Stage 5 — Phase 7 (regions and PlayerBoard) and Phase 8 (façade and legacy paths removed)

`components/PlayerBox` is gone. `GameBoardCell` renders `ui/PlayerBoard/PlayerBoard` with the seat model and the four command ports. PlayerBoard runs `usePlayerSeat`, provides it to its regions through `PlayerSeatContext`, lays them out and draws the seat-wide overlays. `usePlayerSeat` is now 470 lines that compose focused hooks. At the end of Stage 4, `PlayerBox.tsx` was 7,380 lines.

Commits (oldest first, on top of `0412500`):

1. `refactor(game): drop PlayerBox's unused imperative handle (PB-21)`
   - No caller passed a ref. `receiveBattlefieldCards` was already a no-op, and the forwarded `startMarquee` never ran.
2. `refactor(game): move PlayerBox's sibling modules to their owners (PB-18/PB-19)`
   - Each moved with `git mv`:
     - `ContextMenu` → `context-menus/ContextMenu`;
     - `ManaSymbols` → `ui/ManaSymbols`;
     - `cardScale` → `ui/CardScaleContext`;
     - `bigCardPreview` → `ui/BigCardPreview`.
3. `refactor(game): read the seat's deck list from Datatrice instead of the mock deck (PB-21)`
   - Servatrice sends the loaded deck list to its owner, so it becomes `PlayerBoardModel.deck` (parsed with `parseCod`, with a spec). The seat warms its images and metadata from it.
   - Deleted:
     - `mockDeckStore` and the lobby's localStorage stash;
     - `GameBoardCell`'s `MOCK_DECK`;
     - the `DeckCard` mock type.
4. `refactor(game): give the seat view the seat model and command ports directly` (plan Phase 7, step 3)
   - The seat takes `{ model, commands }` and calls the ports. `usePlayerBoxProps` and the mock `RoomMemberWithProfile` are deleted.
   - The adapter's two conventions move into the seat:
     - `toRecipient` maps the menus' "-1 = every player" to the port's `'all'`;
     - life +/- and the set-life prompt go through the life counter's `increment` / `set`.
   - `GameBoardCell` renders no seat until the game id is known, because every port is undefined before then.
   - `GameBoardCell.spec` keeps every request expectation and makes it through the ports.
5. `refactor(game): move the seat's state and actions out of PlayerBox into usePlayerSeat`
   - A pure move of the body above PlayerBox's JSX.
6–7. `refactor(game): render the seat's … through their region owners (PB-20)`
   - The JSX moves unchanged into `StackColumn`, `Battlefield`, `HandZone`, `PlayerInfoPanel` and `ZoneStack`.
   - `ZoneStack` returns a fragment, so the piles stay children of the info column's flex container.
   - Each region carries its menu arrays with it.
   - The structured components previously at those paths were mounted nowhere. They are deleted with their specs: `StackColumn`, `HandZone`, `Battlefield` + `BattlefieldRow` / `BattlefieldStackColumn` / `AttachmentStack`, `PlayerInfoPanel`, `ZoneStack`, the structured `PlayerBoard`, `useHandZone`, `useBattlefield` and `usePlayerInfoPanel`.
8. `refactor(game): replace the PlayerBox façade with PlayerBoard (Phase 7/8)`
   - The three card menus move to `context-menus/SeatCardMenus/{Battlefield,Pile,Stack}CardMenu`, each with its whole item tree.
   - The remaining shell becomes `PlayerBoard`.
   - The characterization spec moves beside it, with every assertion unchanged.
   - The lint guard against importing PlayerBox is removed together with the directory it guarded.
9. `refactor(game): delete the unwired in-game SideboardDialog and PlayerContextMenu (Phase 8)`
   - Also removes the `playerMenu` / `sideboardOpen` dialog state and the sideboard submit / lock handlers.
   - Stage 4's sideboard-plan zone-name fix only touched this dialog, so its changeset is dropped.
10. `test(game): restore the library-view and judge-override integration suites (Phase 8)`
    - Both now run over the real protobuf pipeline:
      - View library → `Command_DumpZone` → `Response_DumpZone` fills the zone view → close shuffles and clears the snapshot;
      - a judge's drag of an opponent's card goes out as `Command_Judge` (target = owner) wrapping the `MoveCard`, with nothing sent unwrapped.
11–23. One commit per hook split out of `usePlayerSeat`, each with its own spec:
    - `ui/PlayerBoard/`:
      - `useSeatCardMetadata`: catalog cache and image preload; the duplicated mapping becomes `seatCardMetaFromLookup`;
      - `useDrawFlights`;
      - `usePendingArrows`;
      - `useSeatPrompts`, which also owns life;
      - `useSeatShortcutOperations`: the 45 seat shortcuts;
      - `useSeatMarquee`;
      - `useSeatDnd`: drag sources, press release, drop zones.
    - `battlefield/Battlefield/`:
      - `useBattlefieldLayout`: Battlefield calls it itself, together with its own drop zone and `useHorizontalWheelScroll`;
      - `useBattlefieldMenuItems`.
    - `ui/ZoneStack/`: `usePileMenus` and `useLibraryMenuItems`.
    - `ui/HandZone/`: `useHandMenuItems`.
    - Region-only state moves into the region that renders it:
      - hand expand / slide → HandZone;
      - stack size → StackColumn;
      - mana pool → PlayerInfoPanel;
      - pile tops → ZoneStack;
      - drag-ghost cards → `SeatDragGhostCards`.
24. `docs(game): describe the seat as PlayerBoard in comments and the e2e page object`
    - Present-tense PlayerBox references now name the new owner. History notes stay.
25. `refactor(game): drop gridMath's attachment helpers along with their only renderers`
    - Their only users were the deleted AttachmentStack and BattlefieldStackColumn.
    - The instructions' attachment section now describes `useBattlefieldLayout`.
26. `refactor(game): drop BoardCellContext, which nothing reads any more`
27. `test(game): co-locate specs with the seat's region components`
    - Adds the `renderSeatCell` fixture (one real seat through GameBoardCell) and a shared `unknownCardCatalog` mock.
28. `chore(changeset): note PlayerBoard replacing the PlayerBox façade`

Gate checks:

- Behaviour is unchanged:
  - `PlayerBoard.characterization` (moved, assertions identical), `GameBoardCell`, and every `Game.*` spec (`cardMenus`, `menuMoves`, `seatPrompts`, `seatDnd`, `dragdrop`, `orchestration`, `selection`, `shortcuts`, `preview`, `seatComposition`, `zoneViews`, `moveTopUntil`) are green at every commit.
  - Their only edits are comments, and `Game.spec`'s pointer to the moved characterization file.
  - The exact card-menu snapshots (`Game.cardMenus.spec`) and the menu-move wire table (`Game.menuMoves.spec`) are unchanged, so request spies show no new command payloads.
- The menu arrays the parallel 17a / 17b branches splice into moved wholesale:
  - pile, library, hand and battlefield menus → their hooks;
  - card menus → `SeatCardMenus`;
  - the library pile's inline menu → `ZoneStack`.
  - No `context-menus/*/…model.ts` file was renamed or restructured.
- `rg components/PlayerBox src integration e2e` finds no import, and `rg features/decks src/features/game` finds none either.

Testing (tip `7e91c45`, repo root, `--maxWorkers=2`):

- `npx turbo run typecheck --concurrency=1`: pass. `npm run lint`: 0 errors.
- Unit tests:
  - sockatrice: 39 / 775.
  - datatrice: 29 / 1196.
  - webatrice: **256 files / 1978 tests**. At `0412500` it was 244 / 1979. Removed: the specs of the deleted structured components, SideboardDialog, PlayerContextMenu and the gridMath attachment helpers. Added: 22 spec files for the new hooks and regions.
- Integration tests:
  - sockatrice: 19 / 166.
  - datatrice: 9 / 136.
  - webatrice: **38 files / 163 tests, 0 skipped**. Before: 36 + 2 skipped files, 160 + 2 skipped tests. `library-view` and `judge-override` run again.
- Webatrice e2e (3.0.0 image; the browsers run in `mcr.microsoft.com/playwright:v1.60.0-noble`, because the host only has an older chromium build):
  - First run: **33 passed, 3 failed (9.5 min)**. The 3 failures were `staff-tools.spec.ts` "admin publishes a server message" in all three browsers. That spec seeds MySQL with `docker compose exec`, and the container had no docker CLI (`spawnSync docker ENOENT`), so no test body ran.
  - Re-run of `staff-tools.spec.ts` with the host's docker CLI and socket mounted into the container: **6 / 6 passed** (chromium, firefox, webkit).
  - Every game spec passed in all three browsers, including the `bulk-card-actions` release gate.
  - The stack was torn down.
- Sockatrice e2e: not run. No sockatrice or server flow changed.

Notes for reviewers (Stage 5):

- **Visible changes:** none intended. The two behaviour-level differences:
  - The seat preloads card images and catalog metadata from the deck list the server sent, not from the lobby's localStorage copy (or a hard-coded Commander list when nothing was picked). For a real game the cards are the same. Preloads now skip deck entries without a printing instead of requesting `/cards/?format=image`.
  - Without a game id, `GameBoardCell` renders no seat. It used to render an inert one. This is only reachable in tests.
- **`usePlayerSeat` is still the seat controller.** It composes the hooks above and returns what the regions read; PlayerBoard provides that through `PlayerSeatContext`.
  - The context still carries about 80 entries. Most of them are the menus and prompts several regions share.
  - Splitting it per region would mean threading those through props, so it stays one context. Each hook's argument interface is now the documented dependency list.
- **Two copies of the library menu**: the library pile's inline array (`ZoneStack`) and the battlefield's Library submenu (`useLibraryMenuItems`). Both hold the same items (only their definition order differs). They are kept separate because PlayerBox had them separate, and a parallel branch may splice into either. Folding them into one is a follow-up.
- **Left for a follow-up: the structured interaction layer.** Nothing renders the CardSlot-based layer any more, but it is still mounted and wired:
  - `CardSlot` / `useCardSlot`;
  - `CardDragOverlay` and `BoxSelectOverlay`;
  - `GameInteractionContext`;
  - the game-level `CardContextMenu` / `ZoneContextMenu` / `HandContextMenu` with their `useGameDialogs` handlers;
  - the CardSlot and BattlefieldRow half of `useGameDnd`.
  - Deleting it touches the card-menu files the parallel 17a / 17b branches are editing, so it is kept out of this PR. `CardSlot/counterColors.ts` stays live, because the seat card and the card menu model use it.
- `GameBoardCell`'s spec now asserts against the ports. The "-1 = every player" mapping and the life counter routing are covered by the characterization reveal and life tests.

## Parity rows closed

n/a. This is an internal refactor. Stage 3's drag fix and shortcut changes have no row of their
own in the parity matrix.

## Desktop reference

- Stages 1–2: none. The characterization specs pin current behaviour and cite the desktop sources
  already referenced in code (`card_menu.cpp`, `player_actions.cpp`, `table_zone.cpp`,
  `arrow_item.cpp`).
- Stage 3 mirrors:
  - `game_graphics/board/card_item.cpp` `CardItem::mouseMoveEvent` (who may start a drag);
  - `game/player/player_info.h` `getLocalOrJudge`;
  - `PlayerActions::sendGameCommand` (judge wrapping);
  - `client/settings/shortcuts_settings.h` (`Player/aMulligan`, `Player/aSet`,
    `Player/aRemoveLocalArrows` defaults).

## Testing

All commands were run from the worktree root on the final commit.

- `npm run typecheck`: pass. One earlier attempt crashed with exit `-1073740791` while the shared
  host was short of memory; the rerun was clean.
- `npm run lint`: 0 errors in all 3 packages.
- `npm test` (per package, `vitest run --maxWorkers=2` per the shared-host memory rule):
  - sockatrice: 33 files / 604 tests passed.
  - datatrice: 26 files / 1083 tests passed.
  - webatrice: **167 files / 1271 tests passed, 0 skipped**. The baseline before this stage was
    161 passed + 2 skipped files, 1166 passed + 2 skipped tests.
  - An earlier uncapped `npm test` run hit `DataCloneError … out of memory` on the shared host
    (about 35 node processes). With capped workers the suite passes.
- `npm run test:integration`:
  - sockatrice: 16 / 146.
  - datatrice: 8 / 124.
  - webatrice: 33 passed + 2 skipped files, 132 passed + 2 skipped tests. The skips are the
    pre-existing `library-view` / `judge-override` skips; see notes.
- Mutation check: lowering PlayerBox's drag threshold from 4 to 3 px fails the threshold test.
- `npm run test:e2e -w @cockatrice/webatrice` (default image): see "E2E" below.

### E2E

`npm run test:e2e -w @cockatrice/webatrice`, default Servatrice image, run once under the shared
e2e mutex: **18 passed (5.8 min)**. That covers all six specs, including the
`bulk-card-actions.spec.ts` release gate. The stack was torn down and the lock released.

## Notes for reviewers

- **Findings pinned rather than fixed** (behaviour changes are out of scope for this stage):
  - An opponent's battlefield card can be dragged onto that opponent's own pile. PlayerBox sends
    `Command_MoveCard` as that player, the server rejects it, and the optimistic dispatch rolls
    back. PlayerBox comments claim an `isSelf` gate in `applyMove` that does not exist.
    `Game.dragdrop.spec.tsx` pins this so the DnD convergence phase (Phase 5) changes it on
    purpose.
  - `Game.tsx` still hosts three game-level dialogs with no live trigger from the current seat:
    `CreateTokenDialog`, `SideboardDialog` (sideboard plan / lock) and `ZoneViewDialog`. Their
    only openers were `PlayerContextMenu` (`openPlayerMenu` has no caller) and `PlayerInfoPanel`
    (inside the unmounted `PlayerBoard`). The seat uses its own token modal, sideboard view and
    pile view. This is documented in `Game.orchestration.spec.tsx` and `Game.spec.tsx` for Phase 6
    to resolve.
- The seat specs mock `services/cards/cardCatalog` so they never touch Scryfall.
  `Game.spec.tsx` now does the same; before, it could reach the network.
- **Not done in this stage:**
  - The integration skips `library-view.spec.tsx` and `judge-override.spec.tsx` (refactor plan
    §9 "Test-suite repair") are left for Phase 8, together with the `mockDeckStore` / mock deck
    bridge that GameBoardCell still feeds PlayerBox.
- Phase 2 (TopBar) was already on this branch's base.
- Later stages (Phases 6–8) will append their entries under **Stages**.

### Stage 4 — Phase 6 (paused; resume from `1ef4dab`)

Paused on request. Every commit below is green on the specs it touches; the full gate and e2e have **not** been run for Stage 4 yet.

Done (oldest first, on top of `c0404c3`):

1. `fix(game): send the sideboard plan with deck-list zone names` — deliberate fix (a). Servatrice's `Server_Player::setupZones` only applies `main` / `side` moves; the dialog sent `deck` / `sb`. Own changeset.
2. `fix(shortcuts): let Cmd answer Ctrl bindings on macOS, as Qt does` — deliberate fix (b), with unit and `Game.shortcuts` specs. Own changeset; the seat changeset's "no longer answer to Cmd" sentence is removed.
3. `refactor(game): split useGameDialogs …` (UG-01) — façade over `hooks/dialogs/` (state + card / zone / library / hand / lifecycle action hooks), each with a spec.
4. `test(game)` — exact card-menu tree snapshots (`Game.cardMenus.spec`) and every menu move's wire payload (`Game.menuMoves.spec`).
5. `refactor(game): render the seat card menus through CardContextMenu` (PB-09/PB-10) — `CardMenuPopup`, open menu in game dialog state (`seatCardMenu`, one menu at a time), `useViewportClampedMenu`.
6. `refactor(game): give the seat a semantic moveCards and retire onMoveCard` — all 39 raw callers converted; wire snapshots unchanged.
7. PB-12 prompts, one per commit: groundwork (PromptDialog description / preview / number type, `openPrompt`, `seatPrompts.ts`, `Game.seatPrompts.spec`), then set life + player counters, P/T + annotation, card counter, library counts (view / draw / reveal top / top-bottom N), move X from top, and `CreateTokenModal` → `CreateTokenDialog` (seeded with the last token, submits through the seat's card port).
8. `refactor(game): move incoming reveal to its dialog directory …` (PB-14) — plus the `SeatCard` leaf leaving PlayerBox.

Remaining Phase 6 sub-steps:

- PB-13: merge the seat's library search / top-N reveal / pile / sideboard viewers (`PlayerBox/LibrarySearchDialog.tsx`, `ZoneRevealDialog.tsx`) into `dialogs/ZoneViewDialog`, move their open state (`librarySearchOpen`, `pileView`, `topCardsView`, `viewSideboardOpen`, the `viewLibraryOpen` / `viewGraveyardOpen` trigger flags) into `useGameDialogs`, and let the views own their `useSeatDragSource` / `useSeatDropZone` like `IncomingRevealDialog`. GAME-018 (pile view "Select All" / "Select Column" with no onClick) to fall out via the game selection.
- PB-17: extract `MoveTopUntilModal` → `dialogs/MoveTopUntilDialog` and the `startMoveTopUntil` loop → `hooks/useMoveTopUntil.ts` (fake-timer / store-race specs).
- SideboardDialog reachability: **decision needed**. Its deck / sideboard lists come from hidden zones, which are empty in a started game, and desktop edits the plan in the pre-game deck view, not in game. Recommendation: host it from `GameLobby` on the selected deck list instead of wiring it into the seat menu.
- Then: full gate (typecheck, lint, unit, integration with `--maxWorkers=2`), webatrice e2e once under the mutex, changeset entry for the visible Stage 4 changes (seat prompts and the token dialog are now the shared MUI dialogs; one card menu across seats), and the final Stage 4 PR section.

Notes to carry into the final write-up:

- The seat prompts and token dialog now render as the shared MUI dialogs (PromptDialog / CreateTokenDialog). A code comment cited an earlier "Replace MUI, don't override it" direction; the refactor plan (PB-12) chose reuse. Flag for the maintainer.
- Pinned, not fixed: a battlefield move asking for "any free column" (x = -1) leaves `resolveBattlefieldDropX` as x = -3 (`Game.menuMoves.spec`).

### Stage 4 — Phase 6 completed (resumed from `1ef4dab`)

This closes the Stage 4 note above. PB-13 and PB-17 are done, and GAME-018 is closed as part of PB-13. `PlayerBox` goes from 8,030 lines at `1ef4dab` to 7,380 (9,842 at the end of Stage 3).

Commits (oldest first, on top of `1ef4dab`):

1. `test(game): pin the seat zone views before they move to ZoneViewDialog`
   - New `Game.zoneViews.spec.tsx`, which runs through `<Game />`. It pins:
     - which menu opens which view, the view titles, and the cards each view lists;
     - the exact dump / shuffle / clear traffic when a view opens and closes, by button and by Esc;
     - top/bottom-N `dumpZone` sizes;
     - the sideboard dump and clear;
     - the pile-menu Clone payload.
   - It also pinned two current behaviours that later commits change on purpose: the GAME-018 gap (Select All does nothing) and the seat's limit of one pile view.
2. `refactor(game): move the seat zone viewers into the ZoneViewDialog directory (PB-13)`
   - `LibrarySearchDialog` / `ZoneRevealDialog` are renamed to `dialogs/ZoneViewDialog/ZoneViewPanel` / `ZoneRevealPanel` with `git mv`.
   - The panel's metadata is typed as `ZoneViewCardMetadata` instead of the mock `DeckCard`.
   - The lint guard against importing PlayerBox now covers the whole directory.
3. `refactor(game): open the seat's zone views as ZoneViewDialogs from the game dialogs (PB-13)`
   - `ZoneViewTarget` gains desktop's `numberCards` / `isReversed`.
   - New `openZoneView`. It dumps a local hidden zone (deck or sideboard). Opening the same view again does nothing. A different count of the same zone replaces the open view and dumps again.
   - `handleCloseZoneView` shuffles a whole-library view and clears a hidden zone's snapshot. It only acts on a view that is open, so a double close cannot send twice.
   - `viewLibraryOpen` / `viewGraveyardOpen` / `viewSideboardOpen` and their PlayerBox effects are removed. `openViewLibrary` / `openViewGraveyard` / `openViewSideboard` now open the local seat's own views, for seated players only.
   - `ZoneViewDialog` is now a container:
     - it reads its cards with the seat's own projections (`zoneToSeatCards`, `revealedCardsToSeatCards`, new `seatDisplayName`);
     - it registers its own seat drag source and drop zone, with the same priorities and resolvers PlayerBox used;
     - graveyard and exile cards open the owning seat's card menu;
     - its selection is the game selection.
   - PlayerBox loses four dialog states, four drag sources, four drop zones and four dialog renders.
   - The old structured CardSlot body of `ZoneViewDialog` is replaced, and its stylesheet is deleted. Its only trigger was the unmounted `PlayerInfoPanel`.
4. `feat(game): select all / select column in graveyard and exile views (GAME-018)`
   - Select All selects every card the view shows. Select Column selects the clicked card's group.
   - Clone applies to the selection when the clicked card is part of it.
   - The seat card menu state carries the ids of the view the menu was opened from.
5. `test(game): pin put-top-cards-on-stack-until before it leaves PlayerBox`
   - New `Game.moveTopUntil.spec.tsx`. It pins the dialog's validation and the loop's traffic as each revealed card lands, using `cardInsertedIntoZone` / `zoneCardCountAdjusted`.
6. `refactor(game): extract put-top-cards-on-stack-until into MoveTopUntilDialog and useMoveTopUntil (PB-17)`
   - `hooks/useMoveTopUntil.ts` holds the loop, unchanged.
   - `dialogs/MoveTopUntilDialog` holds the modal with its markup unchanged. It is opened through the game dialogs (`openMoveTopUntil`, which closes itself after submit like `openPrompt`) and reads the local library size from the store.
   - `Game.moveTopUntil.spec` is unchanged and green before and after.
7. `docs(game): leave the unwired SideboardDialog for Phase 8 and retarget the zone-view specs`
   - Records the decision (below).
   - Updates the comment-only spec headers and `Game.spec`'s zone-view checks, which looked for a close label that no longer exists.
8. `chore(changeset): note the converged menus, prompts and zone views`
   - Adds the changeset entry the paused note asked for, covering the prompts, the token dialog, the single card menu, the zone views and GAME-018.

Gate checks:

- `PlayerBox.characterization`, `GameBoardCell`, and every `Game.*` spec (`cardMenus`, `menuMoves`, `seatPrompts`, `seatDnd`, `dragdrop`, `orchestration`, `selection`, `shortcuts`, `preview`, `seatComposition`) pass with no edits, except:
  - the comment-only header in `Game.orchestration.spec`;
  - the two `Game.spec` zone-view checks noted above.
- The exact menu-tree snapshots (`Game.cardMenus.spec`) are unchanged. That includes the pile-view trees, whose Select All / Select Column rows now act.
- Request spies show no new command payloads:
  - opening and closing a view sends the same `dumpZone` / `shuffle` payloads the seat sent;
  - a drag out of or into a view sends the same `moveCard` payloads;
  - Clone over a selection sends one `createToken` per card, with the existing payload.
- The new pin specs passed before each move and pass after it. The two deliberate changes each flip one pinned test (see notes).
- New unit specs: `useZoneViewDialog` (rewritten), `ZoneViewDialog` (rewritten), `useZoneDialogActions` (eight new cases), `useMoveTopUntil`, `MoveTopUntilDialog`, and `useGameDialogState` (one new case).

Testing (final commit `3667fd7`, repo root; Vitest with `--maxWorkers=2`):

- `npx turbo run typecheck --concurrency=1`: pass.
- `npm run lint`: 0 errors in all 3 packages.
- Unit tests (`npm test`):
  - sockatrice: 33 / 604.
  - datatrice: 26 / 1083.
  - webatrice: **205 files / 1669 tests passed**. On resume, the game feature alone was 95 files / 931 tests; it is now 100 / 978.
- Integration tests (`npm run test:integration`):
  - sockatrice: 16 / 146.
  - datatrice: 8 / 124.
  - webatrice: 33 passed + 2 skipped files, 132 passed + 2 skipped tests. These are the same pre-existing skips.
- E2E: `npm run test:e2e -w @cockatrice/webatrice` (default 3.0.0 image), run once: **9 passed, 9 failed (4.1 min)**. None of the failures is caused by this stage:
  - **webkit (6 failures):** WebKit would not launch on this cloud host (`browserType.launch: Host system is missing dependencies`: libgtk-4, libgraphene, gstreamer and others), so no test body ran.
  - **chromium `app-boots`:** the console-error guard caught `net::ERR_CERT_AUTHORITY_INVALID` from external HTTPS fetches in the sandboxed browser. Firefox passed the same spec.
  - **chromium + firefox `bulk-card-actions`:** both double-clicked Forests landed on the stack instead of the battlefield, so the spec's first `toHaveCount(2)` failed before any bulk action. The play route needs the card's type line, which comes from external lookups the sandbox blocks (see the cert error above). To confirm, I ran this one spec once on chromium at the resume base `1ef4dab`; it fails identically there.
  - Passed in chromium and firefox: `game-create-and-play`, `login-join-room`, `spectator`, `connection-stability`, and firefox `app-boots`.
  - The stack was torn down after the run.

Notes for reviewers (Stage 4, completing the notes above):

- **Deliberate change: graveyard / exile / hand views stay open side by side.**
  - Desktop keeps a view per zone (`GameScene::toggleZoneView`); the seat held a single pile view.
  - `Game.zoneViews.spec`'s pinned "replaces" test is now "keeps both open".
- **Deliberate change (GAME-018): Select All / Select Column act.**
  - They mirror desktop `actSelectAll` / `actSelectColumn` over a ZoneView, through the one game selection.
  - "Column" is the group the card is listed under (By Type by default). It is one column in pile view and one wrapped row group in flat view.
  - Clone then clones every selected card in that view, like desktop's `aClone` over the selection. Draw arrow stays on the clicked card (desktop `actDrawArrow` uses the active card).
  - Because the selection is game-wide, a marquee or Select All in a view clears a board selection, and the other way round, as in desktop's single scene selection.
  - Closing a view drops its cards from the selection. A hand view shares keys with the hand row, so closing it also clears a hand selection.
- **Esc.**
  - Before, every seat dialog had its own document listener, so one Esc closed them all.
  - Now the game's `game.closeRecentView` shortcut closes the most recent view.
  - With no explicit answer, a library view honours the remembered "shuffle when closing" choice (`zoneViewPreferences.ts`, same localStorage key as before). This matches desktop, which shuffles from `ZoneViewWidget::closeEvent`.
  - The search box, where game shortcuts don't fire, closes its own view.
- **Zone-view metadata now comes from the card catalog only.** The panel no longer consults the seat's mock `.cod` deck list, which was itself filled from the same catalog lookups. Grouping waits for the lookup, as it already did for cards missing from the deck list.
- **SideboardDialog (decision made): it stays unwired.**
  - Sideboarding moves to the pre-game lobby on another branch.
  - A comment at its mount in `Game.tsx` and the orchestration spec header both name **Phase 8** to delete it, together with `PlayerContextMenu` and the `sideboardOpen` / `openSideboard` state.
- **Left for Phase 8:**
  - `PlayerBox` props `revealedDeckCards`, `sideboardCards`, `onDumpTopCards`, `onClearRevealedDeck`, `onDumpSideboard` and `onClearRevealedSideboard` are now unread. The `usePlayerBoxProps` adapter still produces them because `GameBoardCell.spec` pins its output. They go with the adapter.
  - `useGameDnd`'s structured "popup" collision scoping (`.zone-view-dialog`) no longer has a structured popup to scope. Its comment says so.
  - The skipped `integration/.../library-view.spec.tsx` could now be revived against `ZoneViewDialog`. Its DOM anchors (`zone-view-dialog` test ids) would need updating.
- **Pinned, not fixed:** auto play in move-top-until sends the hit to the battlefield with `x = -3`. This is the same `resolveBattlefieldDropX` "any free column" finding `Game.menuMoves.spec` pins.
- The move-top-until modal and the zone panels keep their Tailwind markup. As with PB-12, whether these become MUI dialogs is a maintainer call.

### Rebase onto line A

The 53 commits now sit on `parity/06-e2e-hardening` (`d2e3d1e`) instead of `a5fbad4`. That base adds 03 protocol, 12 moderation, 04 command outcomes, 10 account, 11 rooms/chat, 13 administration and 06 e2e hardening. The tip is `0412500`. There are still 53 commits, in the same order, and none were squashed. Stage 1's changeset commit (`f8d0250` before the rebase) is now `dc77ebd`.

- **No logic needed porting.** Line A never touches `PlayerBox.tsx` or any code the refactor moved out of it. In the game feature, line A only changes `Game.tsx` (its error boundary) and the right-sidebar `PlayerList*` files. Both merged cleanly. `PlayerListContextMenu` keeps 12's moderation items and switches to `useViewportClampedMenu`.
- **Conflicts resolved:**
  - `useDeckEditor.ts` (card lookup and codec commits): keeps 04's `useCommandFailureMessage` and takes the codec imports from `@app/services`.
  - `webatrice.instructions.md` (boundaries commit): keeps line A's wrapper list, which no longer mentions LeftNav, and adds the refactor's rule that a feature never imports another feature.
  - `eslint.config.mjs` (PlayerBox import guard): keeps both 06's e2e network rules and the refactor's guard.
  - `i18n-default.json` (zone-view pin commit): resolved with a key-level 3-way merge. That commit's only change to the file was a key reorder, so the file stays exactly as line A has it. Running `npm run translate` at the tip leaves it unchanged.
- **One fix after the rebase**, folded into the codec commit (`43b16d3`): 04's new `useDeckEditor.spec.tsx` imported `emptyCod` from `./cod`, which the codec commit moves. It now imports it from `@app/services`.
- The characterization specs and the `Game.*` specs are unchanged and green. Line A adds no seat-menu items or seat requests, so no exact menu snapshot or request spy changed.

Testing (tip `0412500`, repo root, `--maxWorkers=2`):

- Every one of the 53 commits passes `tsc --noEmit` and `eslint src integration e2e` in webatrice.
- Webatrice unit tests at the earlier stage ends:
  - `dc77ebd` (Stage 1): 206 / 1581.
  - `20ce1b2` (Stage 2): 220 / 1756.
  - `7c61771` (Stage 3): 229 / 1830.
- `npx turbo run typecheck --concurrency=1`: pass. `npm run lint`: 0 errors.
- Unit tests:
  - sockatrice: 39 / 775.
  - datatrice: 29 / 1196.
  - webatrice: **244 files / 1979 tests**.
- Integration tests:
  - sockatrice: 19 / 166.
  - datatrice: 9 / 136.
  - webatrice: 36 passed + 2 skipped files, 160 passed + 2 skipped tests. These are the same pre-existing `library-view` / `judge-override` skips.
- Sockatrice e2e: 4 files / 5 tests passed.
- Webatrice e2e (default 3.0.0 image, chromium + firefox + webkit, after `playwright install-deps`): **36 passed (8.4 min)**. That includes `app-boots` and the `bulk-card-actions` release gate in all three browsers, now that 06's hermetic network fixture is in the base.
