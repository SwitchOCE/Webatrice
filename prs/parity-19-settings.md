# feat(settings): desktop settings page, chat preferences, sound and notifications

> **Stacks on parity/11-rooms-chat-users** (`a6642c3`; below it #10 account/auth → #04 command outcomes → #12 moderation → #03 3.1 protocol → #02 → #01). Review and merge after #11.
>
> **Merge order (Dexie): this PR must merge after the replays PR (#15).** Replays declares `db.version(5)` and is not an ancestor of this branch; this PR declares `db.version(6)`. If this lands first, every user is already at version 6 when replays adds `version(5)`, and a normal upgrade never creates the replay tables. The series order is 06 → 15 (v5) → 14 → 19 (v6) → 21 → 20 (v7). `DexieSchemas/v6.schema.ts` says the same.

## Summary
- **Settings page.** It now works like desktop's settings dialog. Sections are listed in desktop's order with a search box, and search results are ranked the way desktop's `settings_search_model` ranks them. Every change is saved as soon as it is made, as on desktop; sliders and colour pickers save once you let go. Each section has a "Restore defaults" button, which asks first: desktop has no per-page reset, and on Chat it would delete every message macro. Sections are plain data in one registry, `features/settings/sections/index.ts`. Built-in toggle, select, range and colour controls bind straight to a preference key; custom controls cover everything else. When several modules register the same section id, their groups are merged. The `SettingsSectionId` enum already reserves General, Card Sources and Storage, so the sibling Appearance/Storage/Language PR can add sections, or add groups to Appearance, without editing these files.
- **Typed, versioned settings.** The `Setting` row now holds every preference, with desktop's defaults (`PREFERENCE_DEFAULTS`). The row also carries a `version`. A Dexie **version 6** upgrade fills in defaults for missing preferences and keeps every stored value and shortcut override. The same `migrateSetting` step also runs on every load. A stored value with the wrong type (`null`, a string volume) is replaced by its default too. `usePreference` / `usePreferences` return typed values, and fall back to the defaults until the row has loaded; `usePreference` re-renders only when its own preference changes. `getPreferencesSnapshot` is a one-shot read for event handlers. `useMessageMacros` is the selector the in-game Say menu will read.
- **User Interface preferences, connected to the board:**
  - "Play all nonlands onto the stack": with it off, a permanent goes from hand straight to the battlefield, following `PlayerActions::playCard` routing. This applies to both the PlayerBox hand double-click and `autoPlayCard`.
  - "Tap/untap animation".
  - "Close card view window when last card is removed", in `ZoneViewDialog`. It closes through the same path as the close button, so a library view still shuffles.
  - "Invert vertical coordinate": the board already honoured it; it now has a control.
- **Chat preferences, connected to room chat and private chat:**
  - Room message history, and hiding unregistered senders. These compose with #11: ignored senders are already dropped on arrival by Datatrice, and #11's flood / not-sent notice lines always show.
  - Highlighting of your own mentions and of a moderator's `@/all`, with mention colour and invert. Mentions can be turned off. A mention runs over the `_.-` characters Servatrice allows in usernames, so `@foo.bar` mentions `foo.bar` and never `foo`; as in desktop's `checkMention`, trailing characters are cut back until the token names the reader.
  - Alert words, with their own colour, saved as typed (desktop has no validator).
  - The three private-message filters, with desktop's semantics: "ignore all" lets only moderators and administrators through, and the unregistered and non-buddy filters only stop a *new* conversation from opening.
  - An in-game message macro editor (add, edit, remove).
- **Sound.** `SoundEngine` copies desktop's `sound_engine.cpp`: the same event names, a theme with a fallback to the Default theme, master volume, a test sound, and one sound at a time. Desktop's Default and Legacy themes ship in `public/sounds`. `AppAlerts` plays the sounds `MessageLogWidget` plays for game events. Mention, private-message and buddy sounds play where desktop plays them.
- **Notifications (LONG-014, PLAT-023).** There is now a single path, `useNotify` built on `NotificationService`. It shows an OS notification only while the tab is hidden and the user granted permission. Permission is requested from a button in Settings, never on load. Otherwise it shows an in-app toast, so one event never raises both. It is wired to:
  - private messages (`PrivateMessageNotifier`);
  - room mentions ("X mentioned you.");
  - buddies signing on.

  The title marker `(*) ` stands in for desktop's taskbar alert. It is set by game events (spectated games only with the spectator option), mentions and alert words.

## Parity rows closed
- **LONG-008**: closed. Categorised, searchable settings; per-browser persistence; explicit defaults and reset; a migration that keeps shortcuts.
- **LONG-010**: partial. Every User Interface option the board already has the behaviour for is wired. The rest are listed below as follow-ups for the game PRs.
- **LONG-011**: closed. The only gap is the mention completer, a follow-up.
- **LONG-013**: closed.
- **LONG-014**: closed.
- **PLAT-023**: closed.

## Desktop reference
- `cockatrice/src/interface/widgets/dialogs/dlg_settings.cpp`: page order and titles.
- `cockatrice/src/interface/widgets/settings_page/settings_search_model.cpp`: relevance ranking.
- `cockatrice/src/interface/widgets/settings_page/{user_interface,messages,sound,appearance,general}_settings_page.cpp`: labels, groups and control order.
- `libcockatrice_settings/libcockatrice/settings/{interface,chat,sound,message,cards_display}_settings.cpp`: defaults.
- `cockatrice/src/client/sound_engine.cpp` and `cockatrice/sounds/{Default,Legacy}`: the sound engine and sound themes.
- `cockatrice/src/game_graphics/log/message_log_widget.cpp`: which game event plays which sound.
- `cockatrice/src/game/phase.cpp`: the phase-to-sound table.
- `cockatrice/src/game/game_event_handler.cpp`: `emitUserEvent`, which triggers the taskbar alert.
- `cockatrice/src/game/player/player_actions.cpp`: `playCard`, the play-to-stack routing.
- `cockatrice/src/game/zones/view_zone_logic.cpp`: closing an empty card view.
- `cockatrice/src/interface/widgets/server/chat_view/chat_view.cpp`: `checkMention`, `checkWord` and `isModeratorSendingGlobal`.
- `cockatrice/src/interface/widgets/tabs/tab_room.cpp`: room history, unregistered senders and the mention popup.
- `cockatrice/src/interface/widgets/tabs/tab_supervisor.cpp`: the private-message filters, the buddy sign-on popup and `tabUserEvent`.
- `cockatrice/src/interface/widgets/tabs/tab_message.cpp`: the private-message sound and popup.
- `cockatrice/src/interface/widgets/tabs/tab_account.cpp`: the buddy join and leave sounds.
- `cockatrice/src/game_graphics/player/menu/say_menu.cpp`: macros and the Ctrl+1..0 binding, for the follow-up.

## Testing
On the final tip, rebased onto #11 (`a6642c3`), after `git submodule update --init && npm ci`, from the repo root with Vitest capped at `--maxWorkers=2`:
- `npx turbo run typecheck --concurrency=1`: passes (5/5 tasks). Also run at **every commit** of the branch (`git rebase -x`): all pass.
- `npm run lint`: passes (3/3 tasks), 0 errors.
- `npm test -- -- --maxWorkers=2`:
  - Sockatrice: 763 passed.
  - Datatrice: 1176 passed.
  - Webatrice: 1558 passed, 2 skipped (both pre-existing).
- `npm run test:integration -- -- --maxWorkers=2`:
  - Sockatrice: 159 passed.
  - Datatrice: 132 passed.
  - Webatrice: 159 passed, 2 skipped (both pre-existing).
- E2E: not run. No server flow changed; everything here is client-side preference handling, rendering and local feedback.
- New or extended specs:
  - **Persistence:** `settingsMigration` (incl. wrongly typed values, frozen defaults), plus a real-Dexie v4→v6 upgrade in `integration/src/services/dexie/settingsMigration.spec.ts`; `SettingDTO`; `useSettings` (`usePreference` re-renders only for its own key, `getPreferencesSnapshot`, `useMessageMacros`).
  - **Settings page:** the registry, `searchSettings`, `Settings` (dependsOn, volume saved on release with the test sound, restore-defaults confirmation), and each custom control: macro editor, alert words (saved as typed), permission button (follows browser changes), sound test.
  - **Sound and notifications:** `SoundEngine`; `NotificationService` (incl. `watchNotificationPermission`) and `useNotify`; `playSound`.
  - **Chat:** `chatHighlight` (`parseMention`, punctuated usernames), `MENTION_REGEX`, `chatFilters` (verdicts taken on arrival: sender leaves, peer goes offline, moderator logs off, filter changed later), the `Message` highlighting, `RoomChat` filtering (incl. after the sender leaves and after a filter change), `usePlayer` PM filtering and `PrivateMessageNotifier`.
  - **Alerts and board:** `gameEventSound`, `AppAlerts`; play-to-stack; `ZoneViewDialog` close-on-empty.

## Notes for reviewers

### Every desktop setting, once each
Status key:
- **Done**: implemented in this PR.
- **Sibling**: owned by the sibling Appearance/Storage/Language PR. It plugs into the registry.
- **Follow-up**: meaningful in a browser, but needs board or feature work first. Not exposed, so no option is a no-op.
- **N/A**: has no meaning in a browser.

| Desktop page › group | Setting | Status | Notes |
|---|---|---|---|
| General › Language | Language | Sibling | Language section. |
| General › Language | Card text & images language | Sibling | Card data language belongs with Card Sources/Language. |
| General › Language | Language used in card search | Sibling | Same. |
| General › Version | Update channel | N/A | The web client is updated by redeploying; there are no client builds to choose between. |
| General › Version | Check for client updates on startup | N/A | Same. |
| General › Version | Notify if a feature supported by the server is missing in my client | Follow-up | Needs a check of the server's feature set against the client's, which is not a settings change. |
| General › Version | Automatically run Oracle when running a new version | N/A | There is no Oracle. Card data is imported in the browser. |
| General › Card database | Check for card database updates on startup | Sibling | Card Sources/Storage. Import is manual today. |
| General › Card database | Check for card database updates every N days | Sibling | Same. |
| General › Card database | Last update check (read-only) | Sibling | Same. |
| General › Startup | Show tips on startup | N/A | Webatrice has no tip-of-the-day. |
| General › Startup | Startup tab (+ server, room) | Follow-up | Webatrice restores the last route on reload and auto-joins rooms from the server. A startup-tab choice would have to be reconciled with that. |
| General › Paths | Decks / filters / replays / pictures / card database / custom database / token database directories, Reset all paths | N/A | A browser has no file system paths. Data lives in IndexedDB. |
| Connect dialog (not a page) | Auto connect | Already exists | Desktop keeps this in the connect dialog, as Webatrice's login form does. That checkbox is the `@critical` sole persist path, so it is deliberately not repeated here. |
| Appearance › Theme | Theme, open themes folder, palette, style, edit palette | Sibling | |
| Appearance › Home tab | Background source, shuffle frequency, show card name, dim background, button colour | Sibling | |
| Appearance › Playmat | Playmat visibility, default collection behaviour, default playmat collection | Sibling | |
| Appearance › Styling | Style user list | Sibling | |
| Appearance › Menus | Show keyboard shortcuts in right-click menus | Sibling | |
| Appearance › Menus | Show game filter toolbar above list in room tab | Sibling | |
| Appearance › Card printings | Override all card art with personal preference | Sibling | |
| Appearance › Card printings | Bump sets with cards in deck to top | Sibling | |
| Appearance › Card rendering | Display card names, auto-rotate sideways cards, scale on mouse over, rounded corners, max font size | Sibling | |
| Appearance › Card layout | Card view initial / expanded max rows | Sibling | |
| Appearance › Card counters | Counter colours / names | Sibling | |
| Appearance › Hand layout | Display hand horizontally | Follow-up (game) | The board has only a horizontal hand. |
| Appearance › Hand layout | Enable left justification | Follow-up (game) | The board has no justification option. |
| Appearance › Table grid | Invert vertical coordinate | **Done** | Already honoured by the board; now exposed. Registered on the Appearance section so the sibling adds groups next to it. |
| Appearance › Table grid | Minimum player count for multi-column layout | Follow-up (game) | The board layout has no such threshold. |
| User Interface › General | Double-click cards to play them | Follow-up (game) | Single-click-to-play would change the board's click/selection model in PlayerBox. |
| User Interface › General | Clicking plays all selected cards | Follow-up (game) | The board has no play-all-selected path. |
| User Interface › General | Play all nonlands onto the stack | **Done** | Hand double-click routing. Context-menu "Play" keeps its existing one-step routing; aligning it with desktop is noted below. |
| User Interface › General | Do not delete arrows inside of subphases | Follow-up (game) | Needs arrow lifetime tied to phases. |
| User Interface › General | Close card view window when last card is removed | **Done** | `ZoneViewDialog`. |
| User Interface › General | Auto focus search bar when card view is opened | Follow-up (game) | The zone view has no search bar. |
| User Interface › General | Annotate card text on tokens | Follow-up (game) | The card lookup carries no oracle text to annotate with. |
| User Interface › General | Show selection count during drag selection | Follow-up (game) | No selection count is drawn. |
| User Interface › General | Show total selection count | Follow-up (game) | Same. |
| User Interface › General | Use tear-off menus | N/A | A Qt menu feature. |
| User Interface › General | Keep game chat focused when clicking in game | Follow-up (game) | |
| User Interface › Notifications | Enable notifications in taskbar | **Done** | Marks the hidden tab's title on game events (`emitUserEvent` set). Relabelled for the browser. |
| User Interface › Notifications | Notify in the taskbar for game events while spectating | **Done** | |
| User Interface › Notifications | Notify in the taskbar when users in your buddy list connect | **Done** | "Your buddy X has signed on!" as an OS notification or a toast. Greyed out with the spectator option while notifications are off, as on desktop. |
| User Interface › Animation | Enable all / Disable all animations | Follow-up (game) | Only one animation exists, so the buttons would be noise. Add them with the next animation. |
| User Interface › Animation | Tap/untap animation | **Done** | |
| User Interface › Animation | Arrow draw animation | Follow-up (game) | Arrows are not animated. |
| User Interface › Animation | Life counter flash | Follow-up (game) | |
| User Interface › Animation | Battlefield flash on damage | Follow-up (game) | |
| User Interface › Deck editor/storage | Open deck in new tab by default | Follow-up (decks) | |
| User Interface › Deck editor/storage | Show card counts in Visual Deck Editor | N/A | There is no visual deck editor. |
| User Interface › Deck editor/storage | Use visual deck storage in game lobby | N/A | Same. |
| User Interface › Deck editor/storage | Selection animation for Visual Deck Storage | N/A | Same. |
| User Interface › Deck editor/storage | When tagging a .txt deck: do nothing / ask / convert to .cod | N/A | No local deck files. |
| User Interface › Deck editor/storage | Default deck editor type | N/A | There is a single editor. |
| User Interface › Deck editor/storage | Visual deck editor startup tab | N/A | No visual deck editor. |
| User Interface › Deck editor/storage | CommanderSpellbook integration, bracket naming | Follow-up (decks) | |
| User Interface › Replay | Buffer time for backwards skip via shortcut | Follow-up (replays) | |
| Card Sources | URL download priority (add/edit/remove/rate limit/reset), download pictures on the fly | Sibling | |
| Card Sources › Spoilers | Download spoilers automatically, spoiler location, update spoilers | Sibling | |
| Storage | Picture cache method, delete cached/saved images, clear in-memory images, network cache size, redirect TTL, picture cache size, naming scheme | Sibling | |
| Chat › Chat settings | Enable chat mentions | **Done** | |
| Chat › Chat settings | Mention colour, Invert text colour | **Done** | |
| Chat › Chat settings | Enable mention completer | Follow-up | The chat inputs have no completer yet. |
| Chat › Chat settings | Ignore chat room messages sent by unregistered users | **Done** | |
| Chat › Chat settings | Ignore private messages sent by unregistered users | **Done** | |
| Chat › Chat settings | Ignore private messages sent by non-buddy users | **Done** | |
| Chat › Chat settings | Enable desktop notifications for private messages | **Done** | |
| Chat › Chat settings | Enable desktop notification for mentions | **Done** | Also gates the in-app mention toast. |
| Chat › Chat settings | Enable room message history on join | **Done** | |
| Chat › Chat settings | Ignore all private messages | **Done** | |
| Chat › Chat settings | Use game time instead of local time in game logs | Follow-up (game) | The game log does not keep the game time per line. |
| Chat › Custom alert words | Alert words, highlight colour, invert text colour | **Done** | |
| Chat › In-game message macros | Add / Edit / Remove message | **Done** | Editor and `useMessageMacros`. The Say menu and its Ctrl+1..0 shortcuts come in a game PR. |
| Sound | Enable sounds | **Done** | Off by default, as on desktop. |
| Sound | Current sounds theme | **Done** | |
| Sound | Test system sound engine | **Done** | |
| Sound | Master volume | **Done** | Letting go of the slider plays the test sound, as on desktop. Volume and theme stay editable while sound is off, as on desktop; the test button, which would play nothing, is disabled. |
| Shortcuts | All shortcut bindings | Already exists | Now the Shortcuts section. |

### Deliberate choices
- **When the filters decide.** Desktop decides once, as a message arrives. Here the store still holds every message, but each message's verdict is also taken once: `chatFilterVerdicts` is a `WeakMap` keyed by the stored message object (Datatrice never replaces one), filled by the app-wide watchers (`AppAlerts` for room lines, `PrivateMessageNotifier` for private messages) as each message arrives, against the sender, presence and preferences of that moment. `RoomChat` and the Player page read the same verdicts. So a line stays hidden after an unregistered sender leaves the room or a non-buddy goes offline, a moderator's message stays visible under "ignore all" after they log off, and changing a filter affects only messages that arrive afterwards, as on desktop. A PM conversation counts as open once you have written to the peer or one of their messages got through, the browser equivalent of desktop's "a tab already exists".
- **Ignore list (rebased onto #11).** #11 drops ignored senders when their lines arrive, as desktop's `TabRoom::processRoomSayEvent` does. This branch therefore no longer hides them at render time. Its room filter covers only the two settings, room history and unregistered senders. Room notices carry no sender, so they always show.
- **#11's PM notices and presence lines.** These live in `privateChatNotices`, not in `server.messages`, so `PrivateMessageNotifier` never raises a sound or notification for them.
  - `usePlayer` now runs the PM filters over #11's merged conversation. Filtered messages drop out; notices keep their place.
  - Room flood / not-sent notices come from `roomSayFailed`, not `ADD_MESSAGE`, so `AppAlerts` ignores them. Specs cover both cases, plus an ignored sender arriving via `roomSayReceived`.
- **Dexie version.** The settings upgrade is `db.version(6)` (`DexieSchemas/v6.schema.ts`), leaving 5 to the replays branch. Dexie accepts the gap, but correctness depends on merge order: replays (#15) must merge first (see the note at the top). The version is not renumbered, because 20 and 21 already build on 6.
- **Navigation.** No TopBar edits. The Settings entry already exists in #10's `userMenuEntries.ts`.
- **Alert-word colour.** Desktop's `ChatView::getCustomHighlightColor` reads the *mention* colour, which is a bug. Here the alert-word highlight uses the alert-word colour the user picks.
- **Chat history and alerts.** Join history never plays sounds or raises notifications. Desktop runs `checkMention` over history lines as they are drawn.
- **Event sound fidelity.** Webatrice cannot see desktop's event context. As a result:
  - A tap that happens as part of a move (e.g. comes-into-play tapped) plays the tap sound.
  - A shuffle during a mulligan plays the shuffle sound.
  - Disconnect/reconnect is read from the ping crossing `-1`.
- **Tab marker.** Game events mark a hidden tab's title with `(*) `, which clears when the tab is shown again. Webatrice does not otherwise set `document.title`, so nothing competes with the marker.
- **Shared hub edits.** `AppShell.tsx` adds `AppAlerts` to the existing `features/shell` import and renders one element.
- **Barrels.** The services, components, hooks and utils barrels each get additive lines only.
- **Desktop popup timing.** Desktop shows a popup only while its window is inactive. When the tab is visible but you are elsewhere in the app, Webatrice shows an in-app toast instead. For private messages that toast is today's behaviour, kept. Mention and buddy toasts are new, and can be turned off with their preferences.

### Follow-ups
- **Game PRs**: the follow-up rows above; the Say menu reading `useMessageMacros` with Ctrl+1..0; and aligning context-menu Play with `playToStack`.
- **Pre-existing**: `PrivateMessageNotifier` counts messages, so once a conversation reaches the store's `MAX_USER_MESSAGES` cap, new messages are not noticed. This PR does not change that.
- **Sound themes**: Default and Legacy ship. Desktop also loads user themes from its data directory; there is no browser equivalent, so that part is N/A.

## Review response (rv6)
- **major, filters evaluated at render time** → fixed (`fix(chat): decide chat filters when a message arrives`). Each message gets one verdict, taken on arrival against that moment's sender, presence and preferences, and kept in `chatFilterVerdicts`. Specs cover the sender leaving the room, the peer going offline, a moderator logging off under "ignore all", and a filter turned on later.
- **major, mentions stop at `.`/`-`** → fixed in both `MENTION_REGEX` and the alert matcher. `parseMention` follows desktop's `checkMention` chop loop for the reader's own name and otherwise drops only trailing sentence punctuation. `@alice.smith` no longer pings `alice`.
- **major, Dexie v5/v6 ordering** → not renumbered (20/21 build on v6). The required merge order (15 before 19; series 06 → 15 → 14 → 19 → 21 → 20) is stated at the top of this PR and in `v6.schema.ts`.
- **minor, `fillPreferenceDefaults` type check** → fixed: null and wrongly typed values are replaced by the default.
- **minor, Chat order** → macros group moved first.
- **minor, Sound order/test on release/dependsOn** → reordered to enable, volume, theme, test. Letting go of the slider plays the test sound. `dependsOn` removed from volume and theme, as on desktop. The test button stays disabled while sound is off, since desktop's test would play nothing then.
- **minor, buddy notify dependsOn** → added. Desktop also unchecks it when notifications are turned off; not copied, so the user's choice survives toggling.
- **minor, alert-word validator** → removed; saved as typed, like desktop.
- **minor, Restore defaults destructive** → now asks for confirmation first.
- **minor, per-tick writes / whole-row `usePreference`** → range and colour inputs save on the native `change` event; `usePreference` subscribes with a per-key snapshot.
- **minor, toast focus** → `focus-visible` ring.
- **minor, red intermediate commits** → the integration spec update is folded into the Settings page commit. The test commit's message now says v6, and the changeset is in its own `chore` commit. Every commit typechecks.
- **nit, shallow freeze** → `messageMacros` default frozen; preference typed `readonly string[]`.
- **nit, stale permission status** → watches the Permissions API `change` event, with a fallback that re-reads on window focus; the status is `aria-live="polite"`.
- **nit, duplicate AppShell import** → merged.
- **nit, unused section strings** → General/Card Sources/Storage titles removed from the i18n files (the enum ids stay for the sibling PR).
