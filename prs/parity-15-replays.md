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

All runs used Vitest `--maxWorkers=2` per package (shared host).

- `npm run typecheck`: 5/5 tasks pass (`--concurrency=1`).
- `npm run lint`: 3/3 packages, 0 errors.
- Unit:
  - Sockatrice: 38 files, 690 tests pass.
  - Datatrice: 28 files, 1140 tests pass.
  - Webatrice: 172 files pass (2 skipped, both pre-existing); 1254 tests pass (2 skipped).
- Integration:
  - Sockatrice: 17 files, 152 tests pass.
  - Datatrice: 8 files, 124 tests pass.
  - Webatrice: 35 files pass (2 skipped, pre-existing); 140 tests pass (2 skipped), including the new Dexie library spec and the replay-pipeline spec on the real `.cor`.
- E2E: `npx playwright test --project=chromium` against the default 3.0.0 image, under the e2e mutex: 7/7 pass, including the new `replays.spec.ts`. That spec plays a short two-player game, then:
  - finds the match;
  - downloads a `.cor`;
  - toggles the lock;
  - gets a share code;
  - saves the replay to the local library;
  - watches it: skip, seek back to a rebuilt start, fast-forward to "The game has been closed.", then close;
  - deletes the match.

  Firefox and WebKit were not run, to keep the shared Docker host free.
- New specs:
  - Engine timing, seek, buffered rewind and skip-empty.
  - Timeline and histogram ports.
  - Parser: synthetic bytes plus a real Servatrice `.cor` captured from the e2e run (`src/services/replay/__mocks__/two-player-game.cor`).
  - Datatrice replay-game reducers, selectors and reveal gating.
  - Sockatrice replay feeding and the new command callbacks.
  - Playback hook, replay dock and route.
  - Read-only board guard, with a live-board control that shows the same input would reach the server.
  - Server and local panes.
  - Top bar entry.

## Notes for reviewers

- **Engine placement.** The engine lives in Webatrice (`src/services/replay`), not Datatrice. It is playback and UI-time policy: desktop keeps it under `interface/widgets/replay`. It needs timers and user preferences, and Datatrice owns no UI or timers. The engine stays pure: a `ReplaySink` resets and feeds the target game, and state is exposed for `useSyncExternalStore`. Datatrice only gains slice state: `replayGameLoaded` (create or reset), `replayGameUnloaded`, and a `replay` flag on `GameEntry`.
- **Replay games are local, not server state.** The replay hook dispatches `replayGameLoaded`/`replayGameUnloaded` itself, and the game uses a negative id so it can never collide with a Servatrice game. A replay game survives `clearStore` and disconnects. It keeps its board when the recorded `Event_GameClosed` arrives (desktop only logs "The game has been closed."). It never raises the incoming-reveal dialog, and it is left out of `getActiveGameIds`/`getActiveGames`, so it gets no game tab and no leave command.
- **Minimal game-internals footprint.** There are no `PlayerBox.tsx` or `GameBoardCell.tsx` edits. `Game.tsx` exports `GameBoard` with `gameId`/`footer`/`onLeave` props and reads the read-only flag. `BattlefieldSidebar` and `ChatLog` each get a few lines. `useCurrentGame` no longer counts a spectator as host, which also keeps a replay (no local player, unknown host) out of host-only gates.
- **Sockatrice API.** The replay session commands gain optional callbacks, `onDownloaded`/`onFailure` on `replayDownload` and `onFailure` on delete/modify/get-code, so a caller can tell watching from saving and report rejections. `WebClient.replayGameEventContainer` is new. Sockatrice and Datatrice are `minor`.
- **Dexie version.** The local library is Dexie **version 5** (`replays` + `replayData` tables, in `DexieSchemas/v2.schema.ts`). Sibling branches also add a v5 schema, so the integrator should renumber this one when rebasing; it has no upgrade function.
- **E2E Servatrice now stores replays.** `docker/servatrice/servatrice-e2e.ini` sets `store_replays=true`; with it off the replays tab has nothing to test against. This adds one replay row per finished e2e game and nothing else.
- **Deliberately left out:**
  - Reveal windows during playback (desktop's `SKIP_REVEAL_WINDOW` handling). Recorded reveals are logged and seeded into zone views, but no dialog opens.
  - Tap and damage animations.
  - Viewing zones (for example the graveyard) from the read-only board.
  - Multi-select in either pane.
  - Moving entries between local folders.
  - Persisting an opened replay across a page reload: the replay view explains this and links back.
- **Seek clamping.** Seeking is clamped and snapped to the 200 ms clock exactly as desktop does, so seeking to the very end does not process the events in the final partial tick. Playing through does.
