# feat(replays): replays tab, local replay library and replay playback

## Summary

- **Replays tab (LONG-001).** `/replays` was advertised (route enum, left-nav option, shortcut scope) but rendered nothing. It now hosts desktop's `TabReplays`: the local library on the left and "Server replay storage" on the right. The server pane is enabled only for registered users, as in `TabReplays::handleConnected`. It loads the list on connect, and `Event_ReplayAdded` keeps it current. An event without match info (a moderator grant or a redeemed share code) now refreshes the list, as desktop does; before, it passed `undefined` to the store. The pane has loading, empty, disconnected and unregistered states. A "Replays" button sits beside "Decks" in the top bar, the replays screen gets a transient tab, and every open replay keeps its own tab until it is closed (desktop's replay `TabGame`).
- **Server replay actions (LONG-004).** Watch, download to `replay_<id>.cor` (a browser download, every replay of a selected match), save to the local library (desktop's "Download replay": a match goes into a new `<gameId>_<gameName>` folder of the current local folder, a single replay straight into it), toggle expiration lock, delete (with desktop's "Delete remote replay" confirmation), get a share code (desktop's message box with Copy to clipboard) and look a replay up by share code. Failures are reported in desktop's wording, including the `RespFunctionNotAllowed` and `RespNameNotFound` cases. Store state changes only after the server confirms (Datatrice's existing replay reducers).
- **Local replays (LONG-003).** An IndexedDB library (Dexie v5) replaces desktop's local replay directory. It is a tree of folders and replays, with the replay bytes in a separate table so listing a folder never loads them. It supports watch, rename, new folder and delete (with desktop's confirmation; deleting a folder deletes everything in it). You can also open a picked `.cor` without saving it (desktop's *Watch replay*), import `.cor` files into the current folder, and save an entry back out as a file. Picked files must be `.cor` and at most 32 MiB; a batch import reports, per file, what was not a replay, too large or not saved. Both lists are keyboard grids (roving tab stop, arrows/Home/End, Space selects, Enter opens, ←/→ fold matches). Everything works offline.
- **Playback (LONG-002).** `ReplayEngine` ports `ReplayManager`:
  - a 200 ms visual clock, with the events recorded in the same second spread evenly across it;
  - a speed factor, applied by elapsed wall time (snapped to the 200 ms clock) so high speeds survive browser timer clamping;
  - skip-empty (jumps to 500 ms before the next container that is more than ping updates);
  - ±1 s / ±10 s skips;
  - seek, implemented as reset plus a fast replay up to the target, with keyboard rewinds buffered.

  Each recorded container goes through `WebClient.replayGameEventContainer` → Sockatrice's game-event registry → Datatrice's `GameResponseImpl`, reducers and log listeners. A replay therefore builds its state and log lines exactly as a live game does. This mirrors desktop, which feeds `ReplayManager` events into `GameEventHandler`.
- **Read-only board.** `/replay/:replayKey` renders the existing `GameBoard` inside a `GameReadOnlyProvider`. The flag is read at the board's top level:
  - no drag sensors, context menus, deck-select or incoming-reveal dialogs, and no kicked/closed navigation;
  - presses and clicks on the board grid are swallowed in the capture phase, so no card, zone or player control can send a command or apply an optimistic update;
  - hover still reaches the cards, so the preview pane works.

  The sidebar shows "Replay". Its Leave button becomes Close, as desktop relabels it "Close replay", and the say box is hidden. `useGameAffordances` turns every affordance off on a read-only board, so the phase track and game shortcuts are inert too. The replay dock has the timeline silhouette (events per 5 s bin) with click-to-seek and keyboard seeking (a focusable slider), play/pause, the skips, a fast-forward toggle and quick settings (fast-forward speed and skip empty sections, saved like desktop's `replay/*` settings). Replay shortcuts use desktop's defaults: Space, ←/→, Ctrl+←/→, Ctrl+P.

## Parity rows closed

LONG-001, LONG-002, LONG-003, LONG-004

## Desktop reference

- `cockatrice/src/interface/widgets/tabs/tab_replays.cpp`: `handleConnected`, `setRemoteEnabled`, `actOpenLocalReplay`, `actRenameLocal`, `actNewLocalFolder`, `actDeleteLocalReplay`, `actOpenRemoteReplay`, `actDownload`/`downloadNodeAtIndex`, `actKeepRemoteReplay`, `actDeleteRemoteReplay`, `actGetReplayCode`/`getReplayCodeFinished`, `actSubmitReplayCode`/`submitReplayCodeFinished`, `replayAddedEventReceived`
- `cockatrice/src/interface/widgets/server/remote/remote_replay_list_tree_widget.cpp`: columns, `getSelectedReplayMatches` (the enclosing match for a replay row)
- `cockatrice/src/interface/widgets/replay/replay_manager.cpp`: `createReplayTimeline`, `skipToTime`, `handleBackwardsSkip`/`processRewind`, `processNewEvents`, `hasMeaningfulEvent`/`handleSkipEmptySection`, `setTimeScaleFactor`
- `replay_timeline_widget.cpp` (histogram, click to seek), `replay_widget.cpp` (buttons, skip actions), `replay_quick_settings_widget.cpp` (speed 1–99.9, skip empty)
- `cockatrice/src/game/replay.cpp` + `abstract_game.cpp::loadReplay` (no local player, omniscient spectator), `tab_game.cpp` replay constructor, `resetForRewind`, `logReplayStarted`
- `client/settings/shortcuts_settings.h` `Replays/*`, `libcockatrice_settings/.../interface_settings.cpp` replay defaults
- `libcockatrice_network/.../server_game.cpp`: replay containers are stored with `game_id` cleared, and every replay ends with `Event_GameClosed`

## Testing

Final tip `50214e1` (28 commits on `parity/06-e2e-hardening`), from the repo root in a dedicated cloud container.

- **Every commit typechecks**: `npx turbo run typecheck --concurrency=1` was run at each of the 28 commits, and all 28 pass. The rebuilt history's tree is byte-identical to the pre-rewrite tip. Only one later change was made: an `e2e/` spec, which is not part of typecheck.
- `npx turbo run typecheck --concurrency=1`: 5/5 tasks pass.
- `npm run lint`: 3/3 packages, 0 errors.
- Unit (`--maxWorkers=2`):
  - Sockatrice: 39 files, 785 tests pass.
  - Datatrice: 30 files, 1207 tests pass.
  - Webatrice: 212 files pass (2 skipped, pre-existing); 1585 tests pass (2 skipped).
- Integration:
  - Sockatrice: 19 files, 166 tests pass.
  - Datatrice: 9 files, 136 tests pass.
  - Webatrice: 38 files pass (2 skipped, pre-existing); 168 tests pass (2 skipped).
- `npm run test:e2e -w @cockatrice/sockatrice`: 4 files, 5 tests pass.
- `npm run test:e2e -w @cockatrice/webatrice` (3.0.0 image, chromium + firefox + webkit): **39/39 pass** in 12.3 min. `replays.spec.ts` now also enters the saved match folder and switches away from the replay tab and back. The first run hit a webkit launch failure (missing host libraries). After `npx playwright install-deps` it ran clean.
- New or changed specs for the review fixes, each failing before its fix: `WebClient.spec` and `GameResponseImpl.spec` (replay game load/unload), `openedReplays.spec`, `useReplayPlayback.spec`, `GameReplay.spec` (closing; leaving and coming back; phase track inert), `TopBar.spec` (tab survives a switch; closing unloads), `useGridRows.spec`, keyboard walks in `ServerReplays.spec` and `LocalReplays.spec`, `ReplayEngine.spec` (99.9x and the update cap), `ReplayControls.spec` (speed applied as typed; slider keys), `useGameAffordances.spec` (read-only), the save-to-folder, import-check, IndexedDB-failure and rename specs, `game.reducer.replay.spec` (rewind log), `replayDownload` (no store dispatch with `onDownloaded`), and `downloadBlob.spec`.

## Notes for reviewers

- **Rebased onto #06 (line A tip: 01 → 02 → 03 → 12 → 04 → 10 → 11 → 13 → 06).** Merge base verified as the protocol tip `f24ddd9`. Conflicts and how they were resolved:
  - `services/index.ts`, `AppShellRoutes.tsx`, the TopBar icon import / `TabType` / `TYPE_ICON` and `TopBar.spec.tsx`: both sides kept (#13's staff routes and tab next to the replays routes and tabs; #13's user-menu describe and the replays describe).
  - `__test-utils__/mockWebClient.ts`: #12 had already added `replayList`; the other replay mocks are added next to it.
  - `i18n-default.json`: regenerated from the co-located files, then written in the base's key order so the diff only adds the replay keys (no reorder churn).
  - The Replays top-bar button stays next to Decks. It is not a staff page, so it is not a `userMenuEntries.ts` entry. #15 adds no user or moderation context-menu entries, so nothing goes through #12's `UserMenuSlot`.
- **#04 command outcomes, folded in (new commit).** The replay callbacks (`replayDownload`, `replayDeleteMatch`, `replayModifyMatch`, `replayGetCode`, `replaySubmitCode`) now get #04's `CommandFailure` as a second `onFailure` argument, in the same shape as `resetUserPassword`. `replayList` reports through a new optional `ISessionResponse.replayListFailed` → Datatrice `server.Actions.replayListFailed` / `REPLAY_LIST_FAILED`, as `deckList` does. Before this, a replay list that was never answered left the server pane loading forever. The pane explains failures through `useCommandFailureMessage`: timed out, connection lost or not sent, otherwise desktop's text for the code.
- **#06 hermetic e2e (new commit).** `replays.spec.ts` imports `test` from `e2e/fixtures/test.ts` and opens both clients with `newContext`; its `try`/`finally` is gone. Every request goes through the network-isolation fixture.
- **#12/#13 grant replay access.** #13's `useModeratorFunctions` re-reads the replay list after a grant. #15's handler for `Event_ReplayAdded` without match info also re-reads it. A grant to yourself can therefore send two `replayList`s, which is harmless.
- **Engine placement.** The engine lives in Webatrice (`src/services/replay`), not Datatrice. It is playback and UI-time policy: desktop keeps it under `interface/widgets/replay`. It needs timers and user preferences, and Datatrice owns no UI or timers. The engine stays pure: a `ReplaySink` resets and feeds the target game, and state is exposed for `useSyncExternalStore`. Datatrice only gains slice state: `replayGameLoaded` (create or reset), `replayGameUnloaded`, and a `replay` flag on `GameEntry`.
- **Replay games are local, not server state.** They are created, rewound and removed through `WebClient.loadReplayGame`/`unloadReplayGame` → Datatrice's `GameResponseImpl` (no UI dispatch, no new layering exception). An opened replay owns its engine and game until it is closed. The game uses a negative id so it can never collide with a Servatrice game. A replay game survives `clearStore` and disconnects. It keeps its board when the recorded `Event_GameClosed` arrives (desktop only logs "The game has been closed."). It never raises the incoming-reveal dialog, and it is left out of `getActiveGameIds`/`getActiveGames`, so it gets no game tab and no leave command.
- **Minimal game-internals footprint.** There are no `PlayerBox.tsx` or `GameBoardCell.tsx` edits. `Game.tsx` exports `GameBoard` with `gameId`/`footer`/`onLeave` props and reads the read-only flag. `BattlefieldSidebar` and `ChatLog` each get a few lines. `useCurrentGame` no longer counts a spectator as host, which also keeps a replay (no local player, unknown host) out of host-only gates.
- **Sockatrice API.** The replay session commands gain optional callbacks, `onDownloaded`/`onFailure` on `replayDownload` and `onFailure` on delete/modify/get-code, so a caller can tell watching from saving and report rejections. `WebClient.replayGameEventContainer`, `loadReplayGame` and `unloadReplayGame` are new, with optional `IGameResponse.replayGameLoaded`/`replayGameUnloaded`. With `onDownloaded`, `replayDownload` hands the bytes only to the caller (no `replayDownloaded`). Sockatrice and Datatrice are `minor`.
- **Dexie version.** The local library is Dexie **version 5** (`replays` + `replayData` tables, in `DexieSchemas/v2.schema.ts`). Nothing below this branch adds a Dexie version, so v5 stays; #19 (v6) and #20 (v7) stack on top. It has no upgrade function.
- **E2E Servatrice now stores replays.** `docker/servatrice/servatrice-e2e.ini` sets `store_replays=true`; with it off the replays tab has nothing to test against. This adds one replay row per finished e2e game and nothing else.
- **Deliberately left out:**
  - Reveal windows during playback (desktop's `SKIP_REVEAL_WINDOW` handling). Recorded reveals are logged and seeded into zone views, but no dialog opens.
  - Tap and damage animations.
  - Viewing zones (for example the graveyard) from the read-only board.
  - Multi-select in either pane.
  - Moving entries between local folders.
  - Persisting an opened replay across a page reload (opened replays live in memory): the replay view explains this and links back.
- **Seek clamping.** Seeking is clamped and snapped to the 200 ms clock exactly as desktop does, so seeking to the very end does not process the events in the final partial tick. Playing through does.

## Review response (rv5)

| finding | change |
|---|---|
| **major — UI dispatches into a Datatrice slice** (`useReplayPlayback`) | `WebClient.loadReplayGame(gameId, gameInfo)` / `unloadReplayGame(gameId)` raise the new optional `IGameResponse.replayGameLoaded` / `replayGameUnloaded`. Datatrice's `GameResponseImpl` dispatches them, the same way replayed event containers already reach the store. There is **no new documented exception**: `useLeaveGame` is still the only one. Specs: `WebClient.spec` (both calls reach the game response), `GameResponseImpl.spec` (both dispatch), `useReplayPlayback.spec` ("never writes into the games slice itself"). `GameReplay.spec` wires the mock client to `attachResponseHandlers(store)`, so the route spec goes through the shipped path. |
| **major — replay tab disappears for good; `opened` Map leaks** | An opened replay now owns its `ReplayEngine` and its local game. `openReplay(replay, title, webClient)` loads them. `useOpenedReplays()` (a `useSyncExternalStore` over `openedReplays.ts`) lists each one as a top-bar tab, like the game tabs. `closeReplay` stops the engine, unloads the game and drops the entry; it runs from the tab's close button or from "Close replay". Leaving the view no longer tears playback down: coming back resumes at the same position, and a running fast-forward keeps running. The Map now holds only replays the user has not closed. A reload still drops them (in memory, as before). `useWatchReplay` moved to `@app/hooks` with the same signature, so #14's report queue can open a replay without a feature-to-feature import. Specs: `openedReplays.spec`, `TopBar.spec` ("keeps the replay tab after switching to another tab, and returns to it", "closing a replay tab closes the replay and unloads its game"), `GameReplay.spec` ("keeps the replay open … when the view is left"), `useReplayPlayback.spec` ("resumes there"). |
| **major — replay lists not keyboard-operable** | New `useGridRows` (`@app/hooks`; #14's queue table can reuse it). It gives one roving tab stop on the selected row (the first row while nothing is selected). ↑/↓/Home/End move selection and focus, Space selects and Enter opens: watch a replay, enter a folder, or fold a match. On the tree, → expands, ← collapses or steps to the parent. Keys pressed on inner controls are ignored. The server pane keeps `role="treegrid"`, and the local pane is now `role="grid"`. Expander buttons leave the tab order, and rows get a `:focus-visible` outline. Specs: `useGridRows.spec`, plus keyboard walks in `ServerReplays.spec` and `LocalReplays.spec`. |
| minor — fast-forward capped by timer clamping; a dock re-render on every tick | The clock now advances by elapsed wall time × factor, snapped to desktop's 200 ms steps, on a timer of at least 50 ms (`MIN_TICK_INTERVAL_MS`). 99.9x keeps pace, including in hidden tabs, and updates are capped at 20/s. Spec: 99.9x plays 2 min in about 1.25 s, with at most one update per timer step. |
| minor — "save to library" dumps flat | A selected match goes into a new `<gameId>_<gameName>` folder (tab_replays.cpp `downloadNodeAtIndex`), and an existing folder of that name is reused. A single selected replay still lands in the current folder. |
| minor — `.cor` import unchecked; one failure sinks the batch | Import and "Open replay file" both require the `.cor` extension and a 32 MiB cap. The batch settles per file, and the notice names the files that were not replays, too large, or not saved. |
| minor — IndexedDB failures unhandled | `watchEntry` and `exportSelected` now show "Could not read the replay from the local library." |
| minor — timeline slider not focusable | `tabIndex=0`. ←/→ (and ↓/↑) skip 1 s, PageDown/PageUp skip 10 s, and Home/End jump to the ends. The slider stops propagation, so the replay's own ←/→ shortcuts don't fire twice. |
| minor — new fast-forward speed only on blur/close | In-range values apply as typed (desktop `valueChanged`). Enter commits with clamping, like blur and close. |
| minor — read-only mode doesn't cover the phase track/sidebar | `useGameAffordances` reads `useGameReadOnly()`, so every affordance is off on a read-only board. That covers the phase track, the sidebar and the game shortcuts. The board spec now also clicks every element of the phase track (this fails without the fix). |
| minor — `replayDownload` doc vs. dispatch | With `onDownloaded`, the bytes go only to the caller and `replayDownloaded` is not raised. The comment and the changeset say so. |
| minor — hard-coded English | Added `TopBar.i18n.json` (the button, its tooltip and the tab titles) and `Replays.server.matchReplayTitle`. Sizes now use `Intl.NumberFormat` units in the UI language. |
| minor — red intermediate commits | History rebuilt: each feat commit now carries its own specs and its own `i18n-default.json` rollup. The `GameReplay.spec` cast fix (57799cd) is folded in, and the separate test commit is gone. The rebuilt tree is byte-identical to the pre-rewrite tip. Every commit typechecks (see Testing). |
| minor — instructions | `webatrice.instructions.md` documents the v5 `replays`/`replayData` tables and adds a **Replay playback** section: the negative game id, the response-layer path, the opened-replay lifetime and the read-only board. `GameReadOnlyContext.tsx` carries a `@critical` anchor to that section. |
| nit — start notice re-logged on rewind | It is logged once, when the replay opens. A rewind clears the log without repeating it, as desktop's `resetForRewind` does. |
| nit — rename can delete `.cor` | The prompt edits the base name only, and the suffix is re-appended (`actRenameLocal`). |
| nit — dead code | Removed `getIsReplayGame` and the `refresh` export. **Kept** the engine snapshot's `finished`/`processedEvents`/`totalEvents`: they are the engine's observable state, and its specs assert progress through them. They are cheap and documented. |
| nit — duplicated download code | Added `utils/downloadBlob`, now used by both the replay `.cor` save and `ExportDeckModal`. #14's `saveReplayFile` can use it too. |
| nit — `URL` methods replaced for the whole file | Now `vi.spyOn`, which `setupTests`' `restoreAllMocks` restores. |

## Restack notes (wR1)

- `useGridRows` now arrives with #11; this PR reuses it (the file is byte-identical).
- 15 @56af23b hooks barrel: additive (useGridRows from 11 + useWatchReplay). @c1fc85d (grid decision): the hook already exists from 11 (identical file), so this commit only wires LocalReplays/ServerReplays to it; dropped the duplicate barrel line, reworded the message
