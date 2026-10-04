# feat(settings): startup tab, missing-feature notice, mention completer, replay buffer and deck tabs

> **Stacks on #23 playmats** (`13351fd`), below which the settings PR #19 supplies the registry, `usePreference` and the Dexie-backed settings row. Review after #19.

## Summary
Four desktop options PR 19 ported behaviour-less, plus two deck-editor rows, implemented end to end — behaviour, the setting in #19's registry, i18n and tests.

- **General › Startup tab (+ server, room).** The first login after opening Webatrice lands on the chosen page, once per launch as on desktop: Deck Storage, Game Replays, the server lobby (the default) or a Server Room opened by name. The room is resolved against the lobby's room list and joined, desktop's `IntentOpenServerRoomByName`: a room the server auto-joins is waited for rather than joined again (desktop: a second `Command_JoinRoom` is answered with `RespContextError`), the name must match exactly, and a room that is not on the server, a refused join, or a room still not open after desktop's 20 seconds leaves the user in the lobby. A startup server can scope the room to one server. The rule that reconciles this with Webatrice's route restore is below.
- **General › Version: notify when the server supports a feature this client lacks.** Sockatrice now passes `Response_Login.missing_features` to `loginSuccessful`; the notice is desktop's `onNotifyUserAboutUpdate` message box, shown once per server per page load, default on.
- **Chat › Enable mention completer.** Typing `@` in room chat or game chat suggests who can be mentioned, with desktop's trigger (an `@` at the start or after whitespace) and matching (`MatchStartsWith`, case-insensitive, 5 rows visible). Keyboard first: arrow keys move (wrapping), Enter or Tab inserts `@name ` (Tab then lets focus move on, as desktop's focus-out insert does), Escape closes without sending, Enter sends once nothing is open. The input is an ARIA combobox over an always-present listbox (`aria-controls` is always set). Private chat has none, as desktop's message tab has none.
- **User Interface › Replay: buffer time for backwards skip.** Wired to `ReplayEngine`'s rewind buffering (PR 15), read at each backward skip as desktop's `ReplayManager` reads it; desktop's 0–9999 ms range and 200 ms default.
- **Deck tabs and User Interface › Open deck in new tab by default.** As on desktop, opening a deck from My Decks (Deck Storage) always opens it in its own tab (`tab_supervisor.cpp` → `openDeckInNewTab`). The option governs only loading a deck from inside an open editor: the editor gains **Open deck…** (desktop's Load deck, with the deck storage standing in for the file dialog), which follows `AbstractTabDeckEditor::confirmOpen` exactly — option on: a new tab, unless the editor holds a blank deck; option off: the same tab, first asking **Save / Discard / Open in new tab / Cancel** when the deck has unsaved changes (Save opens only once the server takes the deck). Off by default, as on desktop.
- **User Interface › CommanderSpellbook integration** (privacy fix). The Commander bracket estimate sent the deck list to Commander Spellbook automatically, with no opt-in. Desktop's tri-state `commanderspellbookintegrationenabled` is ported: **Disabled** hides the estimate, **Enabled** estimates on request, **Automatic** on every deck change, and the default (unprompted) shows desktop's consent prompt (Enable / Automatic / Disable) the first time a Commander deck opens. Nothing leaves the browser before the user picks Enabled or Automatic.

The registry gains three small pieces for these rows: a `number` control (desktop's spin box), a `text` control (desktop's line edit, saved trimmed on commit) and `visibleWhen`, for a row desktop hides when it does not apply.

## Parity rows closed
- **LONG-010**: the remaining platform-level rows — User Interface › Replay buffer time, Deck editor/storage › "Open deck in new tab by default" and Deck editor/storage › CommanderSpellbook integration. The rest of that row's follow-ups stay board work (w25b and the game PRs).
- **LONG-011**: closed completely. The mention completer was 19's only remaining gap.
- **LONG-008**: General › Version "Notify if a feature supported by the server is missing in my client" and General › Startup "Startup tab (+ server, room)", 19's two General follow-ups.

`docs/cockatrice-parity.md` does not exist on this base (PR 22 regenerates it last), so the rows are listed here.

## The startup rule (startup tab vs. route restore)
Desktop applies its startup tab once per launch (`TabSupervisor::initStartupTabs`, from the `MainWindow` constructor). A browser page restores the route it was on, and Webatrice persists that route in `localStorage`, so every launch boots on the last guarded page and `AuthGuard` hands it to the login page as `from`. The rule:

- **The first login of a page load that is not a reload opens the startup tab**, whatever the last session's route. A page load is a reload when the tab's `sessionStorage` already holds the marker written at boot (it survives a reload, not a new tab, window or browser restart), or when Navigation Timing reports `type === 'reload'` (the fallback when storage is blocked). The navigation type alone was not enough: Firefox under Playwright does not report a scripted reload as `'reload'`, which the e2e run caught (`ba53e13`). A duplicated tab copies `sessionStorage`, so it counts as a reload and keeps its page.
- **Every other login returns to `from`, or the lobby**: the login a reload starts with (so F5 keeps the page), a reconnect after the connection drops, and signing out and back in. This is the pre-PR behaviour plus route return.
- Whether a login opens the startup tab, and the `from` it would otherwise return to, are captured when the login page mounts; the page-load gate latches in an effect once connected. So the post-login re-renders cannot change the destination, and a render React discards (StrictMode, concurrent rendering) cannot spend the first login.
- **Server Room applies only on the startup server** (any server when none is chosen), since room names belong to a server; a login elsewhere, or with no room name, opens the lobby.
- **Desktop's startup server also decides what to connect to at launch.** Webatrice already has that: the login form's Auto Connect, which is the `@critical` sole persist path for that preference. So the startup server only scopes the room, and the Settings row says so; it is shown only for Server Room, where it means something.
- A startup server is stored as `host:port`, not a known-host id: an id does not survive deleting and re-adding a server, the address does. A server since removed stays listed by its address, so what is on screen is what is saved; two known hosts with the same address are listed once.

Desktop's other startup destinations have no Webatrice page (Home, the visual deck storage/editor, a blank deck editor), so they are not offered.

## Desktop reference
- `cockatrice/src/interface/window_main.cpp`: `startupDestination`, `onStartupDestinationConnected`, `startupDestinationConnectsToServer`.
- `cockatrice/src/interface/widgets/tabs/tab_supervisor.cpp`: `initStartupTabs`.
- `cockatrice/src/interface/intents/intent_open_server_room_by_name.cpp`: resolving a room by name, not re-joining an `auto_join` room, and giving up after 20 s (`singleShot(20000)`).
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
- `libcockatrice_settings/libcockatrice/settings/deck_editor_settings.{h,cpp}`: `openDeckInNewTab` defaults to false; `commanderSpellbookIntegrationEnabledIndex` (Disabled / Enabled / Automatic / Unprompted).
- `cockatrice/src/interface/widgets/tabs/abstract_tab_deck_editor.cpp`: `confirmOpen` (:206), `createSaveConfirmationWindow`, `actLoadDeck`.
- `cockatrice/src/interface/widgets/tabs/tab_supervisor.cpp`: `openDeckInNewTab`, the deck storage path.
- `cockatrice/src/interface/widgets/tabs/api/commander_spellbook/commander_bracket_widget.cpp`: `promptCommanderSpellbookIntegration`, `maybeAutoEstimateBracket`.
- `cockatrice/src/interface/widgets/settings_page/user_interface_settings_page.cpp`: the CommanderSpellbook integration selector.
- `cockatrice/src/interface/widgets/utility/line_edit_completer.cpp`: `focusOutEvent`, Tab inserting on focus-out.
- `libcockatrice_settings/libcockatrice/settings/chat_settings.cpp`: `mentionCompleter` defaults to true.

## Testing
Run from the repo root on the final tip `ba53e13`, with Vitest capped at `--maxWorkers=2`:
- `npx turbo run typecheck --concurrency=1`: passes (5/5 tasks).
- `npm run lint`: passes (3/3 tasks), 0 errors.
- `npm test -- -- --maxWorkers=2`: Sockatrice 881 passed; Datatrice 1281 passed; Webatrice 2348 passed, 2 skipped (both pre-existing).
- `npm run test:integration -- -- --maxWorkers=2`: Sockatrice 171 passed; Datatrice 140 passed; Webatrice 210 passed, 2 skipped (both pre-existing).
- `npm run test:e2e -w @cockatrice/webatrice` (3.0.0 image, chromium + firefox + webkit, browsers run in `mcr.microsoft.com/playwright:v1.60.0-noble` because the host's pre-installed Chromium is the wrong build and Firefox/WebKit are absent): **60 passed, 6 skipped, 3 failed** in 12.9 min. The 3 failures are `replays.spec.ts` on each browser, the known cross-PR failure that also fails on the base `13351fd` (#21's `en_US` locale codes crash #15's `Intl.NumberFormat`, fixed in `a941276` above this base); rv21 says to ignore it. `startup-tab.spec.ts` and `chat-mention-completer.spec.ts` pass on all three browsers.
  - The first e2e run (on `bf310a1`) failed `startup-tab.spec.ts` on Firefox only: the login after `page.reload()` opened the startup tab because Firefox under Playwright does not report the reload as `type: 'reload'`. Fixed in `ba53e13`; the second run above is on the final tip.
  - `staff-tools.spec.ts` shells out to `docker compose exec` to seed MySQL, so the container needs the Docker socket, CLI and compose plugin mounted (`-v /var/run/docker.sock:… -v /usr/bin/docker:… -v /usr/libexec/docker/cli-plugins:…`). Without them it fails with `spawnSync docker ENOENT` (as in the first run); with them it passes.
- Sockatrice e2e was not run: this run changed no Sockatrice code.

Specs added or rewritten in this run (each shown to fail before its fix):
- **Startup rule** (`startupDestination.spec.tsx`): `detectPageReload` (first load of a tab is a launch, a later load a reload, a new tab a launch, the navigation-type fallback with no or blocked storage); the resolver with `applyStartupTab`; the hook on a cold start with a stale `from` (startup tab), a cold start with no route, a reload (keeps the route), a reconnect (keeps the route), a second login with nowhere to return (lobby); and the decide-once spec rewritten with `renderHook` on `/login`, connected false → true → re-render, for a cold start and a reload. It fails on `de1dd81` with the `useRef` decision removed (`/replays` instead of `/decks`) and on this tip with the mount capture replaced by a live read of the gate.
- **e2e** (`startup-tab.spec.ts`): signing out and back in stays in the lobby; a reload stays in the lobby; a fresh page in the same context (same storage, last route the lobby) lands on the startup tab.
- **Deck tabs**: `deckOpenLocation.spec.ts` (every `confirmOpen` branch, Save success/failure, Discard, Open in new tab, Cancel); `OpenDeckButton.spec.tsx` (lists the other decks; unmodified → same tab; option on → new tab even when modified; option on over a blank deck → same tab; modified with the option off → prompt, then Save → same tab, failed Save → stays, Discard → discards and same tab, Open in new tab → new tab keeping edits, Cancel → stays); `TopBar.spec.tsx` (a tab per deck from storage whatever the option, a same-tab load takes the replaced tab's place, or closes it when the deck already has a tab); `useDeckEditor.failures.spec.tsx` (`isModified`, `saveNow` resolving true/false on the server's answer, `discardChanges` sending nothing even on unmount).
- **CommanderSpellbook** (`DeckBreakdown.spec.tsx`, `fetch` stubbed): the prompt shows and no request is made; default is unprompted; Disable hides the estimate with no request; dismissing hides it and stays unprompted; Enable makes no request until "Estimate bracket"; Automatic requests at once; Disabled renders no estimate and makes no request. 6 of 7 fail on the pre-fix `DeckBreakdown`.
- **Minors/nits**: `AuthGuard` login-route spec (one location key, fails fast on a loop); `useMentionCompleter` (Tab not prevented, `aria-controls` points at the hidden listbox while closed); `PrivateChat` (named plain textbox, no combobox); `RoomChat` (named input); `useStartupRoom` (gives up after 20 s for a missing auto-join room and an unanswered join); `StartupServerSelect` (duplicate address listed once).

## Notes for reviewers
- **Why the page-load gate is module state.** `pageLoadLoginGate` mirrors `autoLoginGate`: it must be per JS session, not per component, and it is exported so tests can reset it without `vi.resetModules()`.
- **The destination is decided at mount.** The login page stays mounted while the first post-login events arrive (user info, room list), and each re-renders it. A destination read from the latched gate would hand `Navigate` a second `to`, and that second navigation would override the first. The hook captures its eligibility in `useState` at mount and latches the gate in an effect; the re-render spec drives the hook on `/login` (connected false → true → re-render) and fails without the capture (shown below).
- **`AuthGuard` renders nothing on the login route.** A `Navigate` whose `state` is a fresh object is a new location every render, so a guard still mounted on `/login` navigated forever. **Not user-visible**: every guard in the app sits in a route element, and the redirect unmounts it, so the app always redirected exactly once — a spec now asserts that bound by counting the login route's location keys. The loop only bit a guard rendered without its own `Routes`, which is how two spec files render it (`components/Guard`, `features/decks`); both hung until the fix. The guard carries an `@critical` note and a spec for each case.
- **A committed input no longer takes `change` as a draft.** `CommittedInput` saves on the native `change` event; React's `onChange` fires for both `input` and `change`, so a `change` was also stored as the draft and the field kept showing the uncommitted text (`12000` where `9999` was saved, `"Magic  "` where `Magic` was). It now only drafts on `input`, which is what a browser sends while typing or dragging.
- **The completer's popup is local.** PR 26's `Menu` is `role="menu"` with roving focus, the wrong pattern for a combobox whose focus stays in the input. PR 31's `QuickAddSearch` now has the same combobox/listbox logic, so the `TODO` points at a shared `useComboboxListbox` hook built from both, after PR 31. The hook supplies the input's `onChange`, so each chat input changed by a few lines — the diffs stay inside the input, away from PRs 27/28.
- **Chat inputs are named.** The room, private and game chat inputs get a translated `aria-label` (the game input's was hard-coded English).
- **Deck tabs.** Deck tabs are additive, one per deck. A same-tab load from the editor navigates with `DeckRouteState.replacesDeckId`, and TopBar puts the new deck in that tab's place (or just closes it when the loaded deck already has a tab). The editor's autosave means "modified" is an edit still waiting on the debounce or a failed upload; `useDeckEditor` grows `isModified`, `saveNow` (resolves once the server answers) and `discardChanges` (drops the pending edit and the cached copy, so reopening downloads the deck) for the prompt. `flattenFolder` moved from `Decks.tsx` to `deckStorage.ts` so both use it.
- **CommanderSpellbook.** The settings selector lists desktop's three modes plus "Ask before first use" for the unprompted default; desktop's selector has no entry for it and shows "Disabled", which would misreport the state. Dismissing the prompt hides the estimate and asks again next time, as desktop's dialog does when closed. Desktop's bracket-naming choice is not ported: Webatrice's estimate is edhpowerlevel's algorithm and already reports the official bracket numbers and names (Exhibition … cEDH). The gate covers all of `analyzeBracket`, so the Scryfall lookups it makes wait for consent too.
- **Game chat follows desktop's list**: every player and spectator in the game, which is what `addPlayerToAutoCompleteList` collects as they join. A replay has no say box, so it has no completer.
- **The notice is once per server per page load.** Desktop remembers the features it has warned about across launches (`knownMissingFeatures`). A browser picks up a newer client by reloading, so a reload is exactly when the question is worth asking again; within a page load, the notice is not repeated for the same server. The server is keyed by the selected host's address, falling back to the server's name.
- **`missingFeatures` is additive.** The new `LoginSuccessContext` member is optional, so no Datatrice or Sockatrice consumer has to change; a changeset covers each published package.
- **N/A rows from 19's deck editor/storage block**, written out rather than added as no-ops: the visual deck editor and visual deck storage rows (there is none), the default deck editor type (there is one editor), `.txt` tagging and the paths (no local deck files). (An earlier revision listed CommanderSpellbook integration as N/A because "the integration does not exist yet". That was false: the bracket estimate already sent the deck to Commander Spellbook unprompted. It is now ported; see Summary.)

## Follow-ups
- Desktop's startup destinations with no Webatrice page (Home, visual deck storage/editor, a blank deck editor) can be offered as those pages appear.
- A card completer (`[[Card Name]]`, desktop's second completer on the same input) is a natural next step now that the chat inputs have a completer; it needs the card database, so it belongs with the card PRs.
- Share the combobox/listbox logic of `useMentionCompleter` and PR 31's `QuickAddSearch` as a `useComboboxListbox` hook, after PR 31.
- `useReplayPlayback` reads `replayRewindBufferingMs` with `usePreference` but its sibling replay preferences through `settings.value?.…`; move the siblings to `usePreference` (they need entries in `PREFERENCE_DEFAULTS` first).
- An e2e path for the editor's Open deck… prompt (the unit specs cover each answer).

## Review response (rv21)
- **Blocker — startup tab never applied on a cold start** → fixed (`3ad4660`, reload detection hardened in `ba53e13`). The first login of a non-reload page load opens the startup tab whatever `lastRoute` says. e2e: a fresh page in the same context (same storage, last route the lobby) lands on the startup tab. Unit: cold start with a stale `from`, reload, reconnect, second login.
- **Major — later logins jumped to the startup tab** → fixed (`3ad4660`): every other login returns to `from` or the lobby; the "later login" spec now asserts that. The e2e sign-out → sign-in now stays in the lobby.
- **Major — "Open deck in new tab" was not desktop's option** → fixed (`c1ab7e8`): Deck Storage always opens a new tab; the option governs the editor's new Open deck… action, with `confirmOpen`'s prompt. Specs for each path (`deckOpenLocation`, `OpenDeckButton`, `TopBar`, `useDeckEditor`).
- **Major — CommanderSpellbook N/A reason false** → fixed (`a91c8c4`): setting ported, the estimate gated on consent, specs prove no `fetch` before consent (they fail on the pre-fix code: 6 of 7). PR-file claim corrected.
- **Major — red intermediate commits** → deferred to the restack (see below); this run adds commits on top only, as the task requires.
- **Major — the "decide once" spec could not fail** → rewritten with `renderHook` on `/login`, connected false → true → re-render, for a cold start and a reload. Shown to fail: the reload case on `de1dd81` with the `useRef` decision removed (`/replays` instead of `/decks`), and the cold-start case on this tip with the mount capture replaced by a live read of the gate.
- **Minor — AuthGuard login-route spec vacuous** → `e4e13c7`: counts location keys on `/login` (exactly one) and throws past 20 so a loop fails instead of hanging; fails with the login-route check removed.
- **Minor — render-phase side effects** → `3ad4660`: eligibility captured in `useState` at mount, gate latched in an effect.
- **Minor — Tab swallowed** → `e5a589d`: Tab accepts without `preventDefault`, so focus moves on (desktop's focus-out insert, APG); spec asserts the event is not prevented.
- **Minor — PrivateChat completer desktop lacks** → `626be90`: removed; the input is a plain textbox again (spec asserts no combobox).
- **Minor — startup room never gives up** → `16ea245`: 20 s timeout clears the request; fake-timer specs for a missing auto-join room and an unanswered join.
- **Minor — TODO(PR26) target** → `e5a589d`: retargeted to a shared `useComboboxListbox` with PR 31's QuickAddSearch; listed as a follow-up.
- **Nit — aria-controls only while open** → `e5a589d`: listbox always rendered (`hidden` when empty), `aria-controls` always set; spec.
- **Nit — chat inputs unnamed** → `626be90`: translated `aria-label` on room, private and game chat inputs; specs.
- **Nit — duplicate startup server options** → `7899922`: de-duplicated by `host:port`; spec.
- **Nit — replay preference idioms** → follow-up as the review suggests (the siblings need `PREFERENCE_DEFAULTS` entries first).

## Deferred to restack
The review asks to fold red intermediate commits; this run may not rewrite history, so these go to the restack:
- Squash `f70f45a` (AuthGuard loop fix), `734ecf0` (decide once) and `de1dd81` (AuthGuard redirect-once spec) into `4cbea4b`, so no commit hangs the `components/Guard` / `features/decks` specs or lands a reload on the startup tab.
- Move the `CommittedInput` hunk from `8701aae` into `4cbea4b`, which added the controls it fixes.
- Fold `f437ae5`'s e2e tweak into the commit that added `startup-tab.spec.ts` (`4cbea4b`), leaving `f437ae5` a changeset-only commit.
- Optionally fold `3ad4660`…`ba53e13` (this run's review fixes) into the commits they correct (`4cbea4b`, `7ccf3c4`, `8701aae`) so the stack reads as the final design.
