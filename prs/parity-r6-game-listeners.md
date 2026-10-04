# refactor(datatrice): split game listeners by domain

## Summary

- A refactor of `packages/datatrice/src/store/games/game.listeners.ts` that keeps behaviour unchanged. The file
  was 1057 lines: one function registering 18 listeners, with `cardMoved` running six jobs inline over 380 lines.
  It follows the parity-05/09 idiom: characterization first, then move, then delete. Every commit typechecks and
  passes the characterization spec unchanged.
- **Characterization barrier** (`game.listeners.characterization.spec.ts`, 18 tests):
  - A scripted 27-event stream (every listener, both players) runs through the real slice and listener
    middleware. Every action that reaches the store is recorded in order: type plus a compact payload, with
    cards rendered as one-liners and log entries as text.
  - Branch recordings cover the paths that had no tests before:
    - optimistic skip with id migration (the "Owner:" annotation survives) and position patch;
    - the marker consumed on a same-zone reorder;
    - both undo-draw paths (known card, hidden card);
    - open library view sync: prune, insert, reorder, hidden-card splice;
    - every `cardsRevealed` variant: auto top-card, peek, spectator, and the replay early return;
    - resync carry-forward of `userInfo` and open views, plus the game-start log;
    - turn and phase log suppression;
    - `drawBeaconBumped`;
    - unknown game and unknown zone.
  - A registration test pins exactly one listener per inbound event.
- **Six named `cardMoved` jobs as pure helpers** (`cardMove.ts`). Each reads the pre-move zones, returns data,
  and has a table spec:

  | Job | Helper |
  |---|---|
  | identity | `resolveMoveIdentity`, `buildMovedCard`, `planMovePlacement` (`count-transfer` / `none` / `view-reorder` / `same-zone` / `between-zones`) |
  | optimistic bookkeeping | `planOptimisticReconcile` → `migrate` / `patch` / null (`consumeOptimistic` stays in the listener; it is the impure registry) |
  | zone-view sync | `planZoneViewSync` → `{ removeAt, clearTop, insertAt }` |
  | orphan-arrow sweep | `sweepsArrows` + new selector `Selectors.getArrowsTouchingCard` (the audit's `arrowsTouchingCard`) |
  | attachment reparenting | `planAttachmentReparent` |
  | log line | `cardMovedLogEntry` |

- **Other inline planners moved to `game.reducer.helpers.ts`**, each with a table spec. These are `cardAttrFields`
  (the attribute → fields switch), `mergeCardCounter`, `cardAttachFields` (unattach sentinels), `buildTokenCard`,
  `carryForwardResyncState` and `gameInfoUpdateFrom` (the `isFieldSet` reads).
- **Per-domain listener modules.** Each exports `register<Domain>Listeners(mw)`, and `game.listeners.ts` (20 lines)
  is now the barrel:

  | Module | Lines | Events |
  |---|---:|---|
  | `game.listeners.zones.ts` | 307 | `cardMoved`, `cardsDrawn`, `cardsRevealed` |
  | `game.listeners.cards.ts` | 157 | `cardAttrChanged`, `cardAttached`, `cardDestroyed`, `tokenCreated`, `cardFlipped` |
  | `game.listeners.counters.ts` | 53 | `cardCounterChanged`, `counterSet` |
  | `game.listeners.arrows.ts` | 28 | `arrowCreated` |
  | `game.listeners.players.ts` | 75 | `playerPropertiesChanged`, `playerJoined`, `playerLeft` |
  | `game.listeners.phases.ts` | 119 | `gameStateChanged`, `activePlayerSet`, `activePhaseSet`, `turnReversed` |

- Docs: `datatrice-game.instructions.md` gains a "One listener per inbound event, grouped by domain" rule. Two stale
  references to the old file are fixed: the `optimistic.ts` header, and a `webatrice-game.instructions.md` link
  that pointed at a webatrice path that no longer exists.
- Changeset: `@cockatrice/datatrice` patch. The new public members are `Selectors.getArrowsTouchingCard` and
  `type ArrowRef`, both additive.

Commits (oldest first):

1. `test(datatrice): characterize the game listeners before splitting them`
2. `refactor(datatrice): plan cardMoved and the listener payloads in pure helpers`
3. `refactor(datatrice): split the game listeners by domain`

**Behaviour fixes: none.** The aud2 row names no bug in this file. The recordings were captured before any code
moved and pass byte-for-byte after each step.

## Parity rows closed

None; this is an architecture-audit row (aud2 §2, `game.listeners.ts`), not a parity row. The desktop-parity
behaviour it carries is unchanged and is now pinned: undo-draw logging, resync `userInfo` carry, the attach
sentinels, the hidden-move count transfer, and the cross-player TABLE→TABLE arrow sweep and reparent.

## Desktop reference

Behaviour is unchanged. The comments that cite desktop and Servatrice moved with the code they justify:

- `server_abstract_player.cpp:329-333`, `:376`, `:429`, `:449`
- `server_cardzone.cpp:187-190`
- `server_game.cpp:280`
- `player_event_handler.cpp:474-484`
- `CardItem::resetState`, `ZoneViewZoneLogic::removeCard`

## Testing

All run from the repo root on the branch tip `36ae794` after `npm ci`:

- `npx turbo run typecheck --concurrency=1`: pass (5/5 tasks).
- `npm run lint`: pass (3/3 tasks).
- `npm test -- -- --maxWorkers=2`: sockatrice 896, datatrice 1427, webatrice 3542, all passing.
  Totals in the touched spec files:
  - `game.listeners.characterization.spec.ts`: 22 tests;
  - `cardMove.spec.ts`: 63 tests;
  - `game.reducer.helpers.spec.ts`: 40 tests;
  - `game.selectors.spec.ts`: 78 tests.
- `npm run test:integration -- -- --maxWorkers=2`: sockatrice 175, datatrice 144, webatrice 266, all passing.
- `npm run test:e2e -w @cockatrice/webatrice` (chromium, firefox, webkit), run on `2673b2d`: 66 passed, 12 skipped,
  0 failed. (The first run's 24 WebKit failures were all `browserType.launch` errors from missing system libraries;
  a rerun after `npx playwright install-deps` passed.) The follow-up commits touch only datatrice store internals,
  specs, the changeset and an instruction line. No UI code changed, so e2e was not rerun.
- Sockatrice e2e was not run because no sockatrice or server flow changed.

### Mutation probes (rv18)

Each mutant was applied alone and run against the characterization spec, `src/store/games`, and the full datatrice
unit suite. A mutant is killed when at least one test fails.

| Mutant | char spec (22) | games/ (636) | datatrice (1427) |
|---|---|---|---|
| STACK leaves `POSITIONAL_REORDER_ZONES` | killed (1) | killed (2) | killed (2) |
| GRAVE leaves `POSITIONAL_REORDER_ZONES` | killed (1) | killed (3) | killed (3) |
| EXILE leaves `POSITIONAL_REORDER_ZONES` | killed (1) | killed (2) | killed (2) |
| optimistic `patch` forces `faceDown: false` | survives | killed (1) | killed (1) |
| undo-draw prefers the event name (`data.cardName ?? knownName`) | killed (1) | killed (3) | killed (3) |
| undo-draw prefers the event name (`data.cardName \|\| knownName`) | survives | killed (1) | killed (1) |
| `buildMovedCard` writes `attachPlayerId/attachCardId = 0` | killed (7) | killed (10) | killed (10) |
| unattach writes 0 / 0 | killed (1) | killed (4) | killed (4) |

No mutant survives the suite. The faceDown mutant and the `||` form of the undo-draw mutant are caught by
`cardMove.spec.ts`, not by the characterization barrier. That is enough: those planners are table-tested directly.

### Fix found while verifying

`b8f59cc` dropped `makeArrow` from the fixture import in `game.selectors.spec.ts`, but the existing `getArrows` case
still uses it. The result was one `ReferenceError` failure in the datatrice unit suite. Typecheck did not catch it
because spec files sit outside the typecheck project. `36ae794` restores the import.

## Notes for reviewers

- **Module naming.** The task named six domains (cards, zones, counters, arrows, players, phases). aud2 had sketched
  `{card,move,reveal,turn,player}`; I followed the task. `cardMoved` sits in `zones` with its planners in
  `cardMove.ts`. `gameStateChanged` sits in `phases`: four of its five fields are turn and game state, and its
  player resync is one helper call.
- **Registration order.** The global `startListening` order is now grouped by domain instead of the old
  interleaving. Each inbound event has exactly one listener (pinned by the registration test), so no event's effects
  or dispatch sequence can change. The scripted-stream recording confirms this.
- **Planners return data, not actions.** `consumeOptimistic` (a module-level registry) and the post-dispatch
  `getState()` reads stay in the effect, so every helper is pure.
- **Size.** `zones` is 307 lines, above the aud2 size target (`rooms.listeners.ts`, 133). About 125 of those lines
  are `cardMoved`'s dispatch wiring, and its explanatory comments were kept on purpose. All of its decisions now live
  in specced helpers.
- **The characterization spec is large** (1465 lines, mostly inline snapshots). It is meant as the reviewable record
  of what each event dispatches. When the messageLog descriptor work (aud2 `messageLog.ts` row) changes log entries,
  update it with `vitest -u` and review the diff.

**Follow-ups (not done here; each would change recorded behaviour):**

- **Generic optimistic move log.** An optimistic cross-zone move's echo logs "gives Bob control over a card" or
  "puts a card into play" without the card's name. The source entry is already gone, so `cardMovedLogEntry` has no
  name. Logging `reconcile.card.name` would fix it.
- **Mixed effect styles.** Some listeners apply the change themselves (`cardMoved`, `cardAttrChanged`, …) and others
  only log while the reducer applies it (`cardFlipped`, `counterSet`, `arrowCreated`, `activePlayerSet`,
  `activePhaseSet`, `turnReversed`, `playerJoined`, `playerLeft`). aud2 flags this. Unifying it changes the action
  sequence, so it needs its own PR.
- **Three player-name fallbacks** (`playerLeft`'s `'Unknown player'` among them). These belong to the messageLog
  descriptor row.
