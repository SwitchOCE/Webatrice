# feat(game): desktop parity for the pre-game lobby: force start, sideboarding before ready, game invites and links

## Summary

- **Force start (GAME-013).** The lobby looped `Command_KickFromGame` over unready players. That never readied the host or started the game, and the kicks could partly succeed or race. It now does what `DeckViewContainer::forceStart` does: desktop's Yes/No question ("Are you sure you want to force start? / This will kick all non-ready players from the game."), then **one** `Command_ReadyStart{ready: true, force_start: true}`. Servatrice readies the host, kicks the unready players and starts the game in one step (`Server_AbstractPlayer::cmdReadyStart` → `startGameIfReady(true)`). As on desktop, only the host sees the button, and only once a deck is loaded.
- **Sideboarding before ready (GAME-014).** The lobby now has `DeckViewContainer`'s two states. With no deck loaded it shows the deck picker. Once loaded it shows the server's copy of the deck as Maindeck/Sideboard plus desktop's buttons: Unload deck, Ready to start (toggle), Sideboard locked/unlocked (toggle) and Force start (host).
  - While the sideboard is unlocked and the player is not ready, clicking a card moves one copy to the other zone and sends the full plan (`Command_SetSideboardPlan`), as `sideboardPlanChanged` does.
  - Readying disables editing and the lock toggle (`setReadyStart`). Locking resets the view to the bare deck (`setSideboardLocked` → `resetSideboardPlan`), matching the server, which clears its plan on lock.
  - Between games the same view returns from the `deck_list` resync. That resync includes the stored sideboard plan.
- To build that view the client needs its own deck. Desktop takes it from the `Response_DeckDownload` that answers `Command_DeckSelect`, and Sockatrice was dropping that response. Sockatrice now routes it to a new **optional** `IGameResponse.deckSelected(gameId, deckList)`. Datatrice stores it on the local `PlayerEntry.deckList` (`games.Types.DECK_SELECTED`), the same field a resync fills.
- **Invite / copy link (GAME-033), outbound.** "Copy game link" and "Invite to Game..." sit in the lobby header and the in-game player-list header (desktop: Game menu, plus the dock "Invite" button).
  - Both build desktop's `makeGameJoinLink` link (`cockatrice://joingame?hostname&port&roomid&gameid[&game]`).
  - The invite dialog ports `DlgInviteToGame`. It lists online users, buddies first and buddies only when the game is `only_buddies`. It leaves out self, players, spectators and ignored users, and has search, Invite/double-click and Cancel.
  - The invite is a private message, `Join my game "<desc>" (#id): <link>`, the same text desktop's `sendInviteToUser` sends.
- **Game links in chat (GAME-033), inbound.** `cockatrice://joingame` words in room, game and private chat render as "Join game ..." buttons with desktop's anchor labels (`ChatView::appendGameLinkTag`). A single `GameLinkJoinHost` runs desktop's intent chain with desktop's texts:
  - validate the link (desktop's four "Invalid or missing ..." errors);
  - confirm ("Join game \"desc\" (#id) in \"room\" on host:port?");
  - join the room if needed, and wait up to 15 s for the game to be listed ("Game N not found in the room");
  - then `GameSelector::joinGame`: an already-joined game just opens, a full game offers spectating, a password prompt appears when needed;
  - send `Command_JoinGame` and open `/game/:id` on `Event_GameJoined`.

## Parity rows closed

GAME-013, GAME-014, GAME-033

## Desktop reference

- `cockatrice/src/game_graphics/deckview/deck_view_container.cpp`: `forceStart`, `readyStart`/`setReadyStart`, `sideboardLockButtonClicked`/`setSideboardLocked`, `sideboardPlanChanged`, `deckSelectFinished`, `switchToDeckSelectView`/`switchToDeckLoadedView`, `unloadDeck`.
- `cockatrice/src/game_graphics/deckview/deck_view.cpp`: `applySideboardPlan`, `getSideboardPlan`, `resetSideboardPlan`, zone headings ("Maindeck"/"Sideboard").
- `cockatrice/src/interface/widgets/tabs/tab_game.cpp`: `actCopyGameLink`, `actInviteToGame`, `updateInviteButtonState`, `loadDeckForLocalPlayer`, `processLocalPlayerReady`.
- `cockatrice/src/interface/widgets/dialogs/dlg_invite_to_game.cpp`, `interface/widgets/server/game_link.cpp`, `tab_supervisor.cpp sendInviteToUser`.
- `cockatrice/src/interface/intents/url_parser.cpp` (`createJoinGameIntent`, `generateJoinGameMessage`), `intent_join_server_game.cpp`, `interface/widgets/server/game_selector.cpp joinGame`, `chat_view/chat_view.cpp appendGameLinkTag`.
- Server: `server_abstract_player.cpp cmdReadyStart`/`getInfo` (deck_list to self), `server_player.cpp cmdDeckSelect`/`cmdSetSideboardPlan`/`cmdSetSideboardLock`/`setupZones` (plan applied between `main`/`side` only).

## Testing

Run from the worktree with capped workers (`--maxWorkers=2`):

| Gate | Result |
|---|---|
| `npm run typecheck` | pass (5/5 tasks) |
| `npm run lint` | pass, 0 errors in all 3 packages |
| Sockatrice unit | 33 files, 608 tests passed |
| Sockatrice integration | 16 files, 148 tests passed |
| Datatrice unit | 26 files, 1086 tests passed |
| Datatrice integration | 8 files, 125 tests passed |
| Webatrice unit | 174 files, 1331 tests passed |
| Webatrice integration | 35 files passed, 2 skipped (138 passed, 2 skipped; the skips were there before this branch) |
| Webatrice e2e (`test:e2e:up` + `playwright test --project=chromium`, Servatrice 3.0.0, under the e2e lock) | 7 specs, 7 passed (1.6 min), including the new `lobby-sideboard-force-start`. Firefox and WebKit projects were not run. |

New coverage:
- **Sockatrice:** `deckSelect` response routing and the `readyStart` force-start shape (unit + integration); `WebClient.connectTarget` / `WebSocketService.target`.
- **Datatrice:** the `deckSelected` reducer and impl, plus an integration round trip (response → store → resync).
- **Webatrice unit:**
  - `deckViewModel` (plan apply/derive, zone names, stored plan);
  - `GameLobby.spec` (13 tests: force start confirm/decline/visibility, deck states, unload, lock/unlock, swap → plan, ready locks editing);
  - `gameLink` (build/parse/validate/regex/server);
  - invite candidates; `GameInviteControls` (copy, invite message, buddies-only, exclusions);
  - `GameLinkJoinHost` (8 tests: confirm/join/navigate, decline, room join first, not-found timeout, full → spectate, password, other server, invalid link);
  - `GameLinkButton`, and Message rendering a link.
- **Webatrice integration (real WebClient over the mocked socket):** `lobby.spec` (`.cod` upload → `Response_DeckDownload` → deck view; unlock → swap → ready on the wire; force start is exactly one `Command_ReadyStart` with no kicks); `invite-link.spec` (invite → `Command_Message` with the link; a chat link → `Command_JoinGame` → `/game/77`).
- **E2E:** `lobby-sideboard-force-start.spec.ts`. Against real Servatrice, the host unlocks the sideboard, swaps an Island into the maindeck and force-starts while the joiner is unready. The joiner is kicked, and the host's library is 61 cards (the plan applied). The lobby page object now follows the new states.

## Notes for reviewers

- **Defining "game link" for a MemoryRouter app.** Webatrice has no address bar URL for a game, so the game link is desktop's `cockatrice://joingame` link and nothing else. Desktop users can open what we send. Webatrice users get a working "Join game" button in any chat for links from either client. The hostname/port come from `WebClient.connectTarget`. A host stored with a path (`server.cockatrice.us/servatrice`) is reached on the scheme's default port (443, or 80 for local hosts), and desktop's `RemoteClient::connectToHost` also dials 443/80/4748/8080 as WebSockets.
- **Divergence: other servers.** Desktop's intent chain can log in to a different server first. A browser session holds one connection, so a link for another hostname shows "This game is on host:port. Log in to that server to join it." and does not join.
- **Divergence: same-server test.** Desktop compares hostname *and* port. We compare the hostname only (case-insensitive). The same Servatrice is reached by desktop on its TCP port (4747) and by Webatrice on its WebSocket port (4748), so an exact port match would reject every desktop-made link for the server you are on.
- **Divergence: invite feedback.** Desktop focuses the private-chat tab after sending an invite. Navigating away from the lobby would disrupt the host in a single-window app, so we show a toast ("Invitation sent to X") instead. "Copy game link" also toasts success or failure, because a browser clipboard write can fail silently.
- **Sockatrice API:** `IGameResponse.deckSelected` is optional, following the `updateConnectionHealth` precedent, so existing implementers keep compiling. `WebClient.connectTarget` is a read-only getter, so UI code still reaches the server only through `request.*`.
- **Force start errors:** desktop sends the command without a response handler, and so do we. Servatrice rejects a force start from a non-host or without a deck, and the UI never offers it in those states.
- **Sideboard lock edge case:** while locked the view shows the bare deck. While unlocked it shows the user's edits or, if none, the plan stored in the deck string. That is what the server applies if the player readies without editing. Desktop's view hides a `.cod`-stored plan after the initial lock even though the server still applies it; we show what the server will do.
- **Follow-up (not in scope):** the started-board `SideboardDialog` (opened from the player menu) sends plan moves with game zone names (`deck`/`sb`). `Server_Player::setupZones` only honours `main`/`side`, so its plans are silently ignored. Desktop has no mid-game plan editor; the dialog should probably be removed or retargeted. I left it untouched because it lives on the board that the parallel PlayerBox refactor is reshaping.
- New Webatrice strings are in co-located `*.i18n.json` (`GameLobby`, `GameInvite`, `GameLink`); `i18n-default.json` was regenerated by the hook. Existing hard-coded lobby strings were not migrated.
- `PlayerBox.tsx` and `GameBoardCell.tsx` are untouched. The only board-side edit is one line in `BattlefieldSidebar` (the invite controls).

## Rebase (w16r)

Rebased from the old refactor base `f8d0250` onto `dc77ebd` (`parity/05-refactor-seat`, which now sits on line A: 03 protocol, 12 moderation, 04 command outcomes, 10, 11 rooms/chat, 13 admin, 06 e2e hardening). Tip `b2158d5` on `claude/parity-16-game-lobby`.

**Conflicts, all resolved by keeping both sides:**
- Sockatrice `IGameResponse`, the `WebClient` mock and `gameCommands.spec`: 03's `gameLogNotice` / `Command_SetPlaymat` next to this branch's `deckSelected` / `Response_DeckDownload`.
- `AppShell`: `GameLinkJoinHost` mounts beside 04's `CommandFailureNotices` / `ServerNotices`, and 12's `ModerationProvider` + 11's `UserGamesProvider` + `RouteErrorBoundary` still wrap the routes.
- `components/index.ts` (04's error boundaries + game link exports), `utils/index.ts` (11's room/chat/game-info helpers + `gameLink`), `Message.spec` (11's history timestamp tests + the game-link test), `PrivateChat` (11's datatrice entries, failure message hook + `renderGameLinks`).
- `i18n-default.json` regenerated with `prebuild.js -i18nOnly` at each step, never hand-merged.
- `GameLobby.tsx` and `mockWebClient.ts` merged without conflict; nothing from line A was dropped (moderation and user-games references are unchanged against `dc77ebd`).

**Commits added on top:**
- `test(e2e)`: `lobby-sideboard-force-start` now imports `test` from `e2e/fixtures/test.ts` and opens both clients through its `newContext` fixture (06's lint rule failed on the old `browser.newContext`). The fixture closes the contexts, so the try/finally is gone.
- `feat(game)`: **command outcomes in the lobby (04).** `Command_DeckSelect` is the one lobby command whose UI waits on the answer: the deck view appears only after `Response_DeckDownload`. A rejection or timeout used to leave the picker up with no explanation. `deckSelect` now routes `onError` to a new optional `IGameResponse.deckSelectFailed(gameId, responseCode, failure?)`. Datatrice dispatches the `games/deckSelectFailed` signal (`GameCommandFailedPayload`), and the lobby shows "The server did not accept this deck." or 04's timeout/disconnect reason under the picker, through `useCommandFailureMessage`. Ready, force start, sideboard lock and plan stay fire-and-forget. That matches desktop, where `DeckViewContainer` sends them without a handler, and 04's rule for commands sent without options. Their result shows through the player-property events the lobby already renders. Changesets updated (sockatrice, datatrice, webatrice).

**Gate on `b2158d5`** (`--maxWorkers=2`):

| Gate | Result |
|---|---|
| typecheck | 5/5 tasks |
| lint | 3/3 packages, 0 errors |
| Unit | sockatrice 780 (39 files), datatrice 1200 (29), webatrice 1644 (213) |
| Integration | sockatrice 168 (19), datatrice 137 (9), webatrice 166 passed + 2 skipped (40 files; skips are upstream) |
| Sockatrice e2e (Servatrice 3.0.0) | 5/5 (4 files) |
| Webatrice e2e, chromium+firefox+webkit (Servatrice 3.0.0, Playwright 1.60 container) | 36/39 on the full run. The 3 failures were all `staff-tools` (one per browser), with `spawnSync docker ENOENT`: that spec seeds MySQL through the `docker` CLI, which the Playwright image does not have. Re-run with the docker CLI and socket mounted into the container: 6/6 passed. `lobby-sideboard-force-start` (GAME-013/014) passed on all three browsers. |

**GAME-013/014/033 after the rebase:** GAME-013/014 are proven end-to-end against Servatrice 3.0 by `lobby-sideboard-force-start`: unlock, swap an Island into the maindeck, force start; the unready joiner is kicked and the host library is 61 cards. GAME-033 is covered by the `invite-link` integration spec (invite → `Command_Message` with the link; chat link → `Command_JoinGame` → `/game/77`) and the unit suites, all green. There is no Servatrice e2e for invites; that is unchanged from before the rebase.

**Note:** this branch's i18n keys for the deck view first appear in the copy-link commit, not in the deck-view commit, because the deck-view commit's regeneration ran before `npm ci`. The tip is correct.
