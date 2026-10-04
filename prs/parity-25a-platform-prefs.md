# feat(settings): startup tab, missing-feature notice, mention completer and replay buffer

> **Stacks on #23 playmats** (`13351fd`), below which the settings PR #19 supplies the registry, `usePreference` and the Dexie-backed settings row. Review after #19.

## Summary
Four desktop options PR 19 ported behaviour-less, plus one deck-editor row, implemented end to end — behaviour, the setting in #19's registry, i18n and tests.

- **General › Startup tab (+ server, room).** A fresh login lands on the chosen page: Deck Storage, Game Replays, the server lobby (the default) or a Server Room opened by name. The room is resolved against the lobby's room list and joined, desktop's `IntentOpenServerRoomByName`: a room the server auto-joins is waited for rather than joined again (desktop: a second `Command_JoinRoom` is answered with `RespContextError`), the name must match exactly, and a room that is not on the server, or a refused join, leaves the user in the lobby. A startup server can scope the room to one server. The rule that reconciles this with Webatrice's route restore is below.
- **General › Version: notify when the server supports a feature this client lacks.** Sockatrice now passes `Response_Login.missing_features` to `loginSuccessful`; the notice is desktop's `onNotifyUserAboutUpdate` message box, shown once per server per page load, default on.
- **Chat › Enable mention completer.** Typing `@` in room chat, private chat or game chat suggests who can be mentioned, with desktop's trigger (an `@` at the start or after whitespace) and matching (`MatchStartsWith`, case-insensitive, 5 rows visible). Keyboard first: arrow keys move (wrapping), Enter or Tab inserts `@name ` with the caret after it, Escape closes without sending, Enter sends once nothing is open, Shift+Tab still moves focus. The input is an ARIA combobox over a listbox.
- **User Interface › Replay: buffer time for backwards skip.** Wired to `ReplayEngine`'s rewind buffering (PR 15), read at each backward skip as desktop's `ReplayManager` reads it; desktop's 0–9999 ms range and 200 ms default.
- **User Interface › Open deck in new tab by default.** Webatrice's deck tab is single-slot, so desktop's option maps directly: on, each deck keeps its own tab. Off by default, as on desktop.

The registry gains three small pieces for these rows: a `number` control (desktop's spin box), a `text` control (desktop's line edit, saved trimmed on commit) and `visibleWhen`, for a row desktop hides when it does not apply.

## Parity rows closed
- **LONG-010**: the two remaining platform-level rows — User Interface › Replay buffer time and Deck editor/storage › "Open deck in new tab by default". The rest of that row's follow-ups stay board work (w25b and the game PRs).
- **LONG-011**: closed completely. The mention completer was 19's only remaining gap.
- **LONG-008**: General › Version "Notify if a feature supported by the server is missing in my client" and General › Startup "Startup tab (+ server, room)", 19's two General follow-ups.

`docs/cockatrice-parity.md` does not exist on this base (PR 22 regenerates it last), so the rows are listed here.

## The startup rule (startup tab vs. route restore)
Desktop opens a tab at launch; a browser already restores the route you reload on, and the server auto-joins rooms. The rule:

- **The first login of a page load returns to the page the user was on.** `AuthGuard` sends a signed-out user to `/login` carrying that page as router state (`from`); the login page uses it once. So a reload of `/decks` comes back to `/decks`, which is what a browser user expects, and no setting can take that away.
- **Every later login goes to the startup tab** — the login after a sign-out, and the login of a page load that started on `/login` (the usual cold start). This is where desktop's choice applies.
- **Server Room applies only on the startup server** (any server when none is chosen), since room names belong to a server; a login elsewhere, or with no room name, opens the lobby.
- **Desktop's startup server also decides what to connect to at launch.** Webatrice already has that: the login form's Auto Connect, which is the `@critical` sole persist path for that preference. So the startup server only scopes the room, and the Settings row says so; it is shown only for Server Room, where it means something.
- A startup server is stored as `host:port`, not a known-host id: an id does not survive deleting and re-adding a server, the address does. A server since removed stays listed by its address, so what is on screen is what is saved.

Desktop's other startup destinations have no Webatrice page (Home, the visual deck storage/editor, a blank deck editor), so they are not offered.

## Desktop reference
- `cockatrice/src/interface/window_main.cpp`: `startupDestination`, `onStartupDestinationConnected`, `startupDestinationConnectsToServer`.
- `cockatrice/src/interface/widgets/tabs/tab_supervisor.cpp`: `initStartupTabs`.
- `cockatrice/src/interface/intents/intent_open_server_room_by_name.cpp`: resolving a room by name, and not re-joining an `auto_join` room.
- `cockatrice/src/interface/widgets/settings_page/general_settings_page.cpp`: the Startup and Version groups, their labels, and `updateStartupServerControlsVisibility`.
- `libcockatrice_settings/libcockatrice/settings/tabs_settings.{h,cpp}`: `StartupTab`, `startupServer*`, `startupRoomName`.
- `libcockatrice_network/libcockatrice/network/client/remote/remote_client.cpp`: `loginResponse`, `newMissingFeatureFound`.
- `libcockatrice_network/.../server/remote/server_protocolhandler.cpp`: the server filling `missing_features`.
- `cockatrice/src/client/network/connection_controller/remote_connection_controller.cpp`: `onNotifyUserAboutUpdate`, the notice's wording.
- `libcockatrice_settings/libcockatrice/settings/updates_settings.cpp`: `updateNotification` defaults to true.
- `cockatrice/src/interface/widgets/utility/line_edit_completer.cpp` and `completer_utils.cpp`: the mention trigger, prefix, insertion and `createMentionCompleter`.
- `cockatrice/src/interface/widgets/tabs/tab_room.cpp`, `tab_game.cpp`: the `@name` model, `addPlayerToAutoCompleteList` (players and spectators), `actCompleterChanged`.
- `cockatrice/src/interface/widgets/replay/replay_manager.cpp`: `handleBackwardsSkip`, `rewindBufferingTimer`.
- `cockatrice/src/interface/widgets/settings_page/user_interface_settings_page.cpp`: the Replay and Deck editor/storage groups, `rewindBufferingMs` 0–9999.
- `libcockatrice_settings/libcockatrice/settings/interface_settings.cpp`: `rewindBufferingMs` defaults to 200.
- `libcockatrice_settings/libcockatrice/settings/deck_editor_settings.cpp`: `openDeckInNewTab` defaults to false.
- `libcockatrice_settings/libcockatrice/settings/chat_settings.cpp`: `mentionCompleter` defaults to true.

## Testing
Run from the repo root on the final tip, with Vitest capped at `--maxWorkers=2`:
- `npx turbo run typecheck --concurrency=1`: passes (5/5 tasks).
- `npm run lint`: passes (3/3 tasks), 0 errors.
- `npm test -- -- --maxWorkers=2`: Sockatrice 881 passed; Datatrice 1281 passed; Webatrice 2298 passed, 2 skipped (both pre-existing).
- `npm run test:integration -- -- --maxWorkers=2`: Sockatrice 171 passed; Datatrice 140 passed; Webatrice 210 passed, 2 skipped (both pre-existing).
- `npm run test:e2e -w @cockatrice/webatrice` (3.0.0 image, chromium + firefox + webkit): 60 passed, 6 skipped, 3 failed in 13.9 min — `replays.spec.ts` on each browser, a **known cross-PR failure already fixed above this base**: #21's `en_US` locale codes crash #15's `Intl.NumberFormat`, fixed in `a941276`, which is not an ancestor of `13351fd`. It fails identically on the base — verified by running that spec alone in a worktree checked out there — and stops at the saved match folder waiting for `replay_<id>.cor` in the local pane. Everything else passes, including the two specs added here, on all three browsers.
  - The first run failed 27 browser launches for missing host libraries (`libgtk-4.so.1`, …); `npx playwright install-deps` fixed it, as the earlier PRs in this series also found.
- **Webatrice unit-suite memory** (asked after an earlier run of mine was OOM-killed): peak RSS of the whole `vitest run --maxWorkers=2` tree, sampled every 0.5 s, is **8,965 MB on this tip** (2,298 tests) against **8,783 MB on the base** `13351fd` (2,232 tests) — a 2% difference for 66 more tests, so nothing here leaks. The earlier blow-up was the `AuthGuard` navigation loop fixed in this branch, which grew the router's history without bound. The suite's footprint is high on the base too, which is a pre-existing concern for a 7 GB CI runner rather than something this PR introduces.

New or extended specs:
- **Startup destination**: `startupDestination` (the resolver's every branch, and the hook's page-load gate: the first login returns to `from`, a later one goes to the startup tab, the startup server is matched against the host being signed in to); `AuthGuard` (hands the page it leaves to the login route); `useStartupRoom` (already-joined room, join sent once, an `auto_join` room waited for, exact name match, refused join, empty room list).
- **Missing features**: `MissingFeaturesNotice` (shown, nothing missing, setting off, once per server and again for another server); Sockatrice's login spec for the new field.
- **Mention completer**: `mentionQuery` (trigger, prefix, matching, insertion — an email address is not a mention, a finished mention is not a query); `useMentionCompleter` (combobox and listbox semantics, arrow wrapping, Enter and Tab insert, Shift+Tab, Escape without reaching the page, Enter sends when nothing matches, click, blur, setting off); `RoomChat` and `PrivateChat` completion; a game-chat integration spec that completes a player's name and sends the completed text.
- **Settings controls**: `SettingRow` (the number control's range, rounding and emptied field; the text control's trimming; `visibleWhen` hiding a row); `StartupServerSelect` (options, saving by address, a server since removed).
- **Replay and deck tabs**: `ReplayEngine` (a changed buffer time takes effect from the next skip, 0 rewinds at once); `useReplayPlayback` (the preference drives it); `TopBar` (one deck tab by default, a tab per deck with the option on).
- **e2e**: `chat-mention-completer.spec.ts` (keyboard only: list opens, Escape, Enter inserts, Enter then sends) and `startup-tab.spec.ts` (a fresh login opens the chosen tab; a reload keeps the current page). Both read the page from the UI: the app routes through a `MemoryRouter`, so there is no URL to assert.

## Notes for reviewers
- **Why the page-load gate is module state.** `pageLoadLoginGate` mirrors `autoLoginGate`: it must be per JS session, not per component, and it is exported so tests can reset it without `vi.resetModules()`.
- **The destination is decided once per login, in a ref.** The login page stays mounted while the first post-login events arrive (user info, room list), and each re-renders it. Recomputing the destination there handed `Navigate` a second `to` — the gate having latched meanwhile — and that second navigation overrode the first, so a reload of the lobby landed on the startup tab. The e2e run caught it; the fix decides on the render that first sees the connection and latches the gate with the decision, and a spec covers the re-render.
- **`AuthGuard` renders nothing on the login route.** A `Navigate` whose `state` is a fresh object is a new location every render, so a guard still mounted on `/login` navigated forever. **Not user-visible**: every guard in the app sits in a route element, and the redirect unmounts it, so the app always redirected exactly once — a spec now asserts that bound by counting the login route's location keys. The loop only bit a guard rendered without its own `Routes`, which is how two spec files render it (`components/Guard`, `features/decks`); both hung until the fix. The guard carries an `@critical` note and a spec for each case.
- **A committed input no longer takes `change` as a draft.** `CommittedInput` saves on the native `change` event; React's `onChange` fires for both `input` and `change`, so a `change` was also stored as the draft and the field kept showing the uncommitted text (`12000` where `9999` was saved, `"Magic  "` where `Magic` was). It now only drafts on `input`, which is what a browser sends while typing or dragging.
- **The completer's popup is local.** PR 26 is building shared a11y primitives; `useMentionCompleter` carries a `TODO(PR26)` on its own listbox so it can be swapped for the shared one. The hook supplies the input's `onChange`, so the three chat inputs each changed by a few lines — the diffs stay inside the input, away from PRs 27/28.
- **Private chat completes two names.** Desktop's message tab has no completer at all. Rather than leave one of the three inputs out, it completes the conversation's two names, which is what an `@` can usefully mean there.
- **Game chat follows desktop's list**: every player and spectator in the game, which is what `addPlayerToAutoCompleteList` collects as they join. A replay has no say box, so it has no completer.
- **The notice is once per server per page load.** Desktop remembers the features it has warned about across launches (`knownMissingFeatures`). A browser picks up a newer client by reloading, so a reload is exactly when the question is worth asking again; within a page load, the notice is not repeated for the same server. The server is keyed by the selected host's address, falling back to the server's name.
- **`missingFeatures` is additive.** The new `LoginSuccessContext` member is optional, so no Datatrice or Sockatrice consumer has to change; a changeset covers each published package.
- **TopBar.** The deck-tab option touches only the single-slot branch, which is the smallest edit that implements the row; PR 26/27 also edit TopBar, so this is kept to six lines.
- **N/A rows from 19's deck editor/storage block**, written out rather than added as no-ops: the visual deck editor and visual deck storage rows (there is none), the default deck editor type (there is one editor), `.txt` tagging and the paths (no local deck files). CommanderSpellbook integration and bracket naming stay a decks follow-up: the integration itself does not exist yet, so an option would gate nothing.

## Follow-ups
- Desktop's startup destinations with no Webatrice page (Home, visual deck storage/editor, a blank deck editor) can be offered as those pages appear.
- A card completer (`[[Card Name]]`, desktop's second completer on the same input) is a natural next step now that the chat inputs have a completer; it needs the card database, so it belongs with the card PRs.
- `MentionCompleter`'s popup moves to PR 26's shared listbox.
