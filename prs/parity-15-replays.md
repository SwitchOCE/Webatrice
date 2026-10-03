# feat(replays): replays tab, local replay library and replay playback

## Summary

- **Replays tab (LONG-001).** `/replays` was advertised (route enum, left-nav option, shortcut scope) but rendered nothing. It now hosts desktop's `TabReplays`: the local library on the left and "Server replay storage" on the right. The server pane is enabled only for registered users, as in `TabReplays::handleConnected`. It loads the list on connect, and `Event_ReplayAdded` keeps it current. An event without match info (a moderator grant or a redeemed share code) now refreshes the list, as desktop does; before, it passed `undefined` to the store. The pane has loading, empty, disconnected and unregistered states. A "Replays" button sits beside "Decks" in the top bar, and the replays screen and an open replay each get a transient tab.
- **Server replay actions (LONG-004).** Watch, download to `replay_<id>.cor` (a browser download, every replay of a selected match), save to the local library (desktop's "Download replay" writes into the local replay folder), toggle expiration lock, delete (with desktop's "Delete remote replay" confirmation), get a share code (desktop's message box with Copy to clipboard) and look a replay up by share code. Failures are reported in desktop's wording, including the `RespFunctionNotAllowed` and `RespNameNotFound` cases. Store state changes only after the server confirms (Datatrice's existing replay reducers).
- **Local replays (LONG-003).** An IndexedDB library (Dexie v5) replaces desktop's local replay directory. It is a tree of folders and replays, with the replay bytes in a separate table so listing a folder never loads them. It supports watch, rename, new folder and delete (with desktop's confirmation; deleting a folder deletes everything in it). You can also open a picked `.cor` without saving it (desktop's *Watch replay*), import `.cor` files into the current folder, and save an entry back out as a file. A file that is not a replay produces a clear error. Everything works offline.
- **Playback (LONG-002).** `ReplayEngine` ports `ReplayManager`:
  - a 200 ms visual clock, with the events recorded in the same second spread evenly across it;
  - a speed factor;
  - skip-empty (jumps to 500 ms before the next container that is more than ping updates);
  - ±1 s / ±10 s skips;
  - seek, implemented as reset plus a fast replay up to the target, with keyboard rewinds buffered.

  Each recorded container goes through `WebClient.replayGameEventContainer` → Sockatrice's game-event registry → Datatrice's `GameResponseImpl`, reducers and log listeners. A replay therefore builds its state and log lines exactly as a live game does. This mirrors desktop, which feeds `ReplayManager` events into `GameEventHandler`.
- **Read-only board.** `/replay/:replayKey` renders the existing `GameBoard` inside a `GameReadOnlyProvider`. The flag is read at the board's top level:
  - no drag sensors, context menus, deck-select or incoming-reveal dialogs, and no kicked/closed navigation;
  - presses and clicks on the board grid are swallowed in the capture phase, so no card, zone or player control can send a command or apply an optimistic update;
  - hover still reaches the cards, so the preview pane works.

  The sidebar shows "Replay". Its Leave button becomes Close, as desktop relabels it "Close replay", and the say box is hidden. The replay dock has the timeline silhouette (events per 5 s bin) with click-to-seek, play/pause, the skips, a fast-forward toggle and quick settings (fast-forward speed and skip empty sections, saved like desktop's `replay/*` settings). Replay shortcuts use desktop's defaults: Space, ←/→, Ctrl+←/→, Ctrl+P.

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

Rebased run, on tip `0d1d235`, all from the repo root in a dedicated cloud container.

- `npx turbo run typecheck --concurrency=1`: 5/5 tasks pass.
- `npm run lint`: 3/3 packages, 0 errors (covers `integration/` and `e2e/` since #06).
- Unit (`--maxWorkers=2`):
  - Sockatrice: 39 files, 783 tests pass.
  - Datatrice: 30 files, 1205 tests pass.
  - Webatrice: 210 files pass (2 skipped, pre-existing); 1560 tests pass (2 skipped).
- Integration:
  - Sockatrice: 19 files, 166 tests pass.
  - Datatrice: 9 files, 136 tests pass.
  - Webatrice: 38 files pass (2 skipped, pre-existing); 168 tests pass (2 skipped). This includes the Dexie library spec and the replay pipeline on the real `.cor`.
- `npm run test:e2e -w @cockatrice/sockatrice`: 4 files, 5 tests pass.
- `npm run test:e2e -w @cockatrice/webatrice`, against the default 3.0.0 image, chromium + firefox + webkit: **39/39 pass** in 12.2 min. That is 13 tests per browser, including `replays.spec.ts` on the hermetic fixture. The host browser deps were installed with `npx playwright install-deps`.
- New specs in this rebase:
  - Sockatrice: the transport reason reaches every replay `onFailure`, and `replayList` reports `replayListFailed`.
  - Datatrice: `replayListFailed` dispatches the signal.
  - Webatrice: a delete that times out shows the timed-out reason, and a replay list that is never answered stops loading and shows the connection-lost reason.

The scenarios from the original branch are unchanged:
- The engine: timing, seek, buffered rewind and skip-empty.
- The timeline and histogram.
- The parser: synthetic bytes and a real Servatrice `.cor` (`src/services/replay/__mocks__/two-player-game.cor`).
- Datatrice: replay-game reducers, selectors and reveal gating.
- The playback hook, the replay dock and the route.
- The read-only board guard.
- The server and local panes.
- The top bar entry.

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
- **Replay games are local, not server state.** The replay hook dispatches `replayGameLoaded`/`replayGameUnloaded` itself, and the game uses a negative id so it can never collide with a Servatrice game. A replay game survives `clearStore` and disconnects. It keeps its board when the recorded `Event_GameClosed` arrives (desktop only logs "The game has been closed."). It never raises the incoming-reveal dialog, and it is left out of `getActiveGameIds`/`getActiveGames`, so it gets no game tab and no leave command.
- **Minimal game-internals footprint.** There are no `PlayerBox.tsx` or `GameBoardCell.tsx` edits. `Game.tsx` exports `GameBoard` with `gameId`/`footer`/`onLeave` props and reads the read-only flag. `BattlefieldSidebar` and `ChatLog` each get a few lines. `useCurrentGame` no longer counts a spectator as host, which also keeps a replay (no local player, unknown host) out of host-only gates.
- **Sockatrice API.** The replay session commands gain optional callbacks, `onDownloaded`/`onFailure` on `replayDownload` and `onFailure` on delete/modify/get-code, so a caller can tell watching from saving and report rejections. `WebClient.replayGameEventContainer` is new. Sockatrice and Datatrice are `minor`.
- **Dexie version.** The local library is Dexie **version 5** (`replays` + `replayData` tables, in `DexieSchemas/v2.schema.ts`). Nothing below this branch adds a Dexie version, so v5 stays; #19 (v6) and #20 (v7) stack on top. It has no upgrade function.
- **E2E Servatrice now stores replays.** `docker/servatrice/servatrice-e2e.ini` sets `store_replays=true`; with it off the replays tab has nothing to test against. This adds one replay row per finished e2e game and nothing else.
- **Deliberately left out:**
  - Reveal windows during playback (desktop's `SKIP_REVEAL_WINDOW` handling). Recorded reveals are logged and seeded into zone views, but no dialog opens.
  - Tap and damage animations.
  - Viewing zones (for example the graveyard) from the read-only board.
  - Multi-select in either pane.
  - Moving entries between local folders.
  - Persisting an opened replay across a page reload: the replay view explains this and links back.
- **Seek clamping.** Seeking is clamped and snapped to the 200 ms clock exactly as desktop does, so seeking to the very end does not process the events in the final partial tick. Playing through does.
