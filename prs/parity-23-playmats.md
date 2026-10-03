# feat: Cockatrice 3.1 playmats and command round-trip latency

> **Stacks on parity/13-administration** (`8fca043`; line A: #01 lint → #02 → #03 3.1 protocol → #12 → #04 → #10 → #11 → #13). Review and merge after #13.

## Summary
- **Playmats (Cockatrice #7101), on 3.1 servers.**
  - *State.* Servatrice already sends a player's playmat in `ServerInfo_PlayerProperties.playmat_params`, and #03's properties merge stores it. `games.Selectors.getPlayerPlaymat` turns it into a `games.Playmat`, following `PlayerLogic::setPlaymatFromProperties`: an empty card name means no playmat, and the params are clamped to the server's ranges. The result keeps its reference until the playmat itself changes. This matters because the merge re-clones the params whenever the player toggles ready or the sideboard lock.
  - *Board.* `PlayerPlaymat` draws the card's art behind the player's battlefield. It ports desktop's `PlaymatUtils` crop math (`computeArtSourceRect` / `coverFitRect`) and follows desktop's "Playmat visibility" setting. It is mounted once in `PlayerBox.tsx`, which is the only change to that file (+2 lines).
  - *Announcing your own playmat.* Desktop sends `Command_SetPlaymat` right after `Command_DeckSelect`, using the deck file it just sent (`DeckViewContainer::resolveAndSendPlaymat`). The web client can select a server-stored deck it never parsed, so `usePlaymatSync` takes the deck's playmat from the `Event_PlayerPropertiesChanged` Servatrice sends for the deck select instead.
    - It resolves the playmat with a port of `resolvePlaymatForDeck`: override, fallback or deck-only mode, combined with fixed, round-robin or random picking. Random never picks the previous playmat again, and the round-robin position advances when a game ends (`TabGame::stopGame`).
    - As on desktop, it resolves after a deck select, on every Ready (`sendReadyStartCommand(true)`), and when the collection settings change (not on a visibility-only change). So round-robin and random move on in each game of a match without a deck reselect.
    - It sends `SetPlaymat` only when the result differs from what is already announced, and recognises the server's echo of its own `SetPlaymat`.
    - The per-match state desktop keeps on `DeckViewContainer` (deck playmat, last sent, last resolved, rotation index) lives in a module-level map keyed by game (`features/game/hooks/playmatSyncState.ts`), not in the `Game` route. It survives leaving and returning to `/game/:id` (Settings included) and is dropped once the game leaves the store.
  - *Settings.* A new **Playmats** tab in Settings repeats desktop's "Playmat settings" group with the same labels and defaults: visibility, default collection behaviour, and the "Default Playmats" collection with list mode, add, edit, remove, move up and move down. Each entry has crop sliders for the values desktop edits in spin boxes (left/right margin %, vertical offset, zoom) over a preview that uses the in-game crop math. Every change is saved immediately; a dragged slider is saved once, on release.
- **Round-trip time (Cockatrice #7153).**
  - *Measurement.* Sockatrice ports `LatencyTracker`, a 64-sample ring buffer that gives last, median, nearest-rank p95 and max. `ProtobufService` times every answered command from send to response. Commands that expire or are reset record nothing.
  - *Reporting.* Stats go out through the new optional `ISessionResponse.updateLatencyStats` at most once a second. They are zeroed on disconnect, as `clearLatencyStats` does on desktop. Datatrice stores them in `server.latency` (`getLatency`).
  - *Display.* `LatencyStatus` in the TopBar ports `LatencyStatusWidget` and `LatencyGraphWidget`: "Ping: N ms", a sparkline (green at 0 ms to red at 500 ms, height scale floored at 100 ms), the stats as a tooltip (and as the button's accessible description), and a click-open popover with a larger graph.

## Parity rows closed
- **PLAT-002**: follow-up. The playmat and RTT features that #03 vendored the protocol for now have state and UI.
- **LONG-012**: partial. This adds the table/playmat part of desktop's Appearance page. Themes and palettes remain open.
- **Not a gap row: #7153 RTT.** It is a client-side measurement, so it works on 3.0 servers too. Desktop shows it on every server, so it is deliberately **not** capability-gated.

## Desktop reference (Cockatrice `add65caa`)
- `libcockatrice_protocol/.../serverinfo_playerproperties.proto`, `command_set_playmat.proto`
- `libcockatrice_network/.../server_player.cpp`: `cmdDeckSelect`, `cmdSetPlaymat` (clamps, broadcast shape)
- `cockatrice/src/game/player/player_logic.cpp`: `setPlaymatFromProperties`; `game_event_handler.cpp`
- `cockatrice/src/game_graphics/player/player_graphics_item.cpp`: `updatePlaymat`, `paint`
- `cockatrice/src/interface/widgets/playmat/playmat_utils.h`, `playmat_collection_dialog.cpp`, `playmat_settings_dialog.cpp`
- `libcockatrice_deck_list/.../playmat_resolver.cpp`; `game_graphics/deckview/deck_view_container.cpp`: `resolveAndSendPlaymat`; `tabs/tab_game.cpp`: `stopGame`
- `interface/widgets/settings_page/appearance_settings_page.cpp`; `libcockatrice_settings/.../interface_settings.cpp` (defaults)
- `libcockatrice_network/.../latency_tracker.{h,cpp}`, `abstract_client.cpp`: `recordLatency`, `clearLatencyStats`; `tests/latency_tracker_test.cpp`
- `cockatrice/src/client/latency_status_widget.cpp`, `latency_graph_widget.cpp`; `interface/window_main.cpp`

## Testing
The full gate was run from the repo root at tip `d444301` after the rv7 fixes, with Vitest limited to `--maxWorkers=2`.
- `npx turbo run typecheck --concurrency=1`: 5/5 pass at the tip. It also passes at **every** commit of the branch (`git rebase -x`).
- `npm run lint`: 3/3 pass, 0 errors.
- `npm test`: all pass.
  - Sockatrice: 790 passed.
  - Datatrice: 1210 passed.
  - Webatrice: 1534 passed, 2 skipped. Both skips were already there.
- `npm run test:integration`: all pass.
  - Sockatrice: 167 passed.
  - Datatrice: 137 passed.
  - Webatrice: 160 passed, 2 skipped. Both skips were already there.
- e2e after the rv7 fixes: the only user-visible change is the ping button's accessible name, so I re-ran `connection-stability.spec.ts` (which uses the updated `ConnectionStatus.latency` locator) in the Playwright 1.60 container against 3.0.0. It passed **6/6** on chromium, firefox and webkit. The full webatrice e2e suite was not re-run. Pre-fix results: Sockatrice e2e 5/5. Webatrice e2e had 31 passed and 8 failed, and none of the 8 came from this branch: `staff-tools` fails because the container has no docker CLI, and `bulk-card-actions`/`app-boots` fail with `ERR_CERT_AUTHORITY_INVALID`, the same on base `8fca043`.
- Specs:
  - **Sockatrice:** `LatencyTracker.spec` (desktop's `latency_tracker_test` ported case for case); round-trip timing in `ProtobufService.outcomes.spec`; `WebClient.spec` forwarding; integration `latency.spec` (keepalive ping timed through the wire, zeroed on disconnect).
  - **Datatrice:** `playmat.spec`; `getPlayerPlaymat` (stability across unrelated updates, SetPlaymat follow, clear); latency reducer, selector and `SessionResponseImpl`; integration test that a SetPlaymat-shaped event sets the clamped playmat and adds no log line.
  - **Webatrice:** `playmatCrop.spec`, `PlayerPlaymat.spec`, `resolvePlaymat.spec`, `playmatSyncState.spec`, `usePlaymatSettings.spec`, `Settings.spec` tab.
    - `usePlaymatSync.spec`: fallback, override, reselect, echo, settings change, round-robin advancing on the next game's Ready with the same deck, random re-roll on Ready, no re-roll on a visibility change, state kept across unmount/remount (deck playmat and round-robin cursor), clean slate per game, 3.0 server, spectator.
    - `PlaymatSettingsPanel.spec`: adds aria value text, and a drag that saves only on release.
    - `LatencyStatus.spec`: accessible name and description.
    - The 5 new `usePlaymatSync` specs and the new crop/ping specs fail on the pre-fix code.
- A 3.1-image e2e for playmats was not run. The task marked it optional, and the master image was not built.

## Notes for reviewers
- **Settings seam (branch 19).** The four playmat preferences live in their own localStorage store (`hooks/usePlaymatSettings.ts`), using desktop's defaults (show all, fallback, fixed, empty list). This branch does not include the typed settings framework, so they are not yet stored there. When rebasing onto #19:
  1. Move the four fields into `PREFERENCE_DEFAULTS` and the `Setting` row: `playmatVisibility=2`, `playmatMode=1`, `playmatFallbackBehavior=0`, `playmatFallbackList=[]`.
  2. Make `usePlaymatSettings` / `getPlaymatSettings` read them through `usePreferences` / `getPreferencesSnapshot`.
  3. Register `features/settings/playmats/PlaymatSettingsPanel` as a custom "Playmat settings" group of the **Appearance** section, where desktop puts it, and drop this branch's extra Settings tab.
  4. The `webatrice.playmatSettings` key can be imported once in the v6 migration, or simply dropped.
- **Capability gating.** Rendering and sending are gated on `supports(state, ServerCapability.PLAYMATS)`; 3.0 servers never send `playmat_params` anyway. The settings panel is client-local and is not gated, because desktop shows it regardless of server. A note on the panel says playmats need a 3.1 server.
- **Divergences from desktop, all small:**
  - The playmat covers the battlefield area only. Desktop's covers the table and the stack.
  - There is no art-attribution caption, and sideways (battle) art is not rotated upright before cropping.
  - Before the server echoes the local player's playmat, desktop pre-resolves it locally. Here the playmat appears when the echo arrives, a round trip later.
  - The first playmat seen in a game this tab has no sync state for (a resumed game, or a page reload) is treated as the deck's own. Navigating within the app keeps the state.
  - The crop editor uses sliders where desktop has `QDoubleSpinBox`es; desktop's drag/scroll direct-manipulation preview (#7161) is not ported.
  - "Add" takes a free-text card name; desktop picks from the card DB (see Review response).
  - Collection entries are picked by card name. There is no printing chooser yet; `cardProviderId` stays empty, so Scryfall shows its default printing. `features/card-art-rules/cardPrintings.ts` could move to `services` to give both pages one chooser.
- **Desktop quirk mirrored.** `playmatClampedZoom` caps at 4× even though its comment says the zoom-out floor bypasses the cap. The code is mirrored, not the comment, and `playmatCrop.spec` pins it.
- **i18n.** Strings use ICU syntax, as the app's i18next-icu instance expects. `i18n-default.json` was regenerated: it adds keys and reorders some, and removes none.
- The crop math lives in `@app/utils/playmatCrop` because both the board and the settings preview use it.

## Review response (rv7)
- **major, sync state in `Game` refs** → fixed. The deck playmat, last sent, last resolved and rotation index live in `playmatSyncState` (a module-level map keyed by game, pruned once the game leaves the store), as desktop keeps them per match on `DeckViewContainer`. A new deck hash is also taken as a deck select on its own. I did **not** make the deck hash the *only* signal: reselecting the same deck leaves the stored hash unchanged, and only its playmat reverting shows the reselect. So "a playmat this client did not send" still counts, but `lastSent` now survives remounts, which removes the misreading. Specs unmount and remount the hook mid-game: Override → Settings → Deck only restores the deck's mat, and the round-robin cursor survives.
- **major, round-robin/random don't advance per game** → fixed. The hook re-resolves when the local `readyStart` turns on, mirroring `sendReadyStartCommand(true)` → `resolveAndSendPlaymat()`. The spec now keeps `deckHash: 'h1'` across games and flips `readyStart`; a second spec covers random re-rolling on Ready without repeating. Ordering differs slightly: desktop sends SetPlaymat just before ReadyStart, and here it goes out when the ready echo arrives. Servatrice accepts SetPlaymat at any time while a deck is loaded (`cmdSetPlaymat` only checks `deck`), so the only effect is that the new mat can appear a round trip after the game starts.
- **minor, visibility re-resolves** → fixed with `sameCollectionSettings` (mode, list mode and collection, compared by value). Spec added.
- **minor, `lastPlaymatByPlayer` never pruned** → fixed. `lruMemoize(playmatFromParams, { maxSize: 32, resultEqualityCheck: dequal })`, the `selectAllAttachments` idiom. The existing stability specs still pass. Nothing user-visible changed, so no new failing spec was added.
- **minor, crop slider aria value text** → fixed with `getAriaValueText` using the label formatter. Spec added, and the text corrected to "sliders".
- **minor, ping `aria-label`** → fixed. The accessible name is the visible "Ping: N ms", the stats are an `aria-describedby` description, and the e2e page object locator was updated.
- **minor, a localStorage write on every slider tick** → fixed. The slider keeps a local draft and saves on `onChangeCommitted`. Spec drags by pointer and checks that nothing is saved until release.
- **minor, free-text "Add"** → **not applied here.** The only card-name search is `features/decks/search.ts` (Scryfall autocomplete), and the boundaries lint forbids feature→feature imports. The local Dexie card DB may also be empty. Doing it properly means moving the search and `features/card-art-rules/cardPrintings.ts` into `services` and giving both pages one chooser. That is a cross-feature refactor, so it is listed as a follow-up.
- **nit, `useCallback` wrapper** → removed.
- **nit, commit hygiene** → `ea4a992` is squashed into the playmat-settings commit (no add-then-remove of the `feature-widgets` alias), and the RTT e2e hunk moved into the latency top-bar commit. While running typecheck per commit I also found that `feat(sockatrice): measure command round-trip times` was red on its own: datatrice's required `ServerState.latency` landed before the webatrice fixture. That fixture line is folded into that commit. Every commit now typechecks; the rewrite leaves the tip's tree byte-identical.
- **nit, "Add..."/"Edit..."** → "Add"/"Edit".
