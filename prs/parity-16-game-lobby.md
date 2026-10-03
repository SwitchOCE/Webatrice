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
