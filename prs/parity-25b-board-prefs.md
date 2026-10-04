# feat(game): desktop's board preferences and card presentation options

> **Stacks on claude/restack-16-game-lobby** (`d2e516c`). Branch `claude/parity-25b-board-prefs`, 21 commits, each typechecked on its own.

## Summary
Every desktop option that PR 19 left as "Follow-up (game)" now works on the board. So does the rest of desktop's AppearanceSettingsPage. Each option has a setting with desktop's default, i18n strings and tests. `SETTINGS_VERSION` is now 3; the migration step is described under Animations.

- **Hand layout** (Appearance › Hand layout):
  - "Display hand horizontally" (on by default). Off gives desktop's vertical hand: a column one and a half cards wide between the info panel and the stack, on every seat (`PlayerGraphicsItem::rearrangeZones`).
  - "Enable left justification" for the horizontal hand row.
  - Seat placement is one pure function, `seatGrid.ts`.
  - The vertical pile maths (`SelectZone::computeZoneLayout` / `calcDropIndexFromY`) moved from HandZone to `ui/VerticalPile`. The vertical hand and the stack use it, and it honours "Card overlap percentage" (`verticalCardOverlapPercent`, desktop's 33%).
- **Minimum player count for multi-column layout** (Appearance › Table grid). The default is desktop's 4; below that count, seats stack in one column.
- **Double-click to play / single-click play** (`CardItem::handleClickedToPlay`, `PlayerActions::playCard`). This lives in `useSeatClickToPlay`.
  - Double-click stays the default.
  - With it off, a press released without dragging plays the card.
  - Alt never plays a card. Shift plays it face down onto tablerow 2.
  - From the stack, a spell goes to the graveyard and anything else goes onto the battlefield.
  - On the battlefield a click taps or untaps the card.
  - "Clicking plays all selected cards" plays the whole selection, highest card id first, when the clicked card is in it. On the battlefield the click toggles the whole selection, as `TableZone::toggleTapped` does.
- **Do not delete arrows inside subphases** (on by default). An arrow's `delete_in_phase` is now the last subphase of its phase (`Phases::getLastSubphase`; `utils/arrowLifetime.ts`). With the option off it is the current phase.
- **Auto focus the zone view search bar**. The zone view's search takes focus when the view opens. The view's height follows desktop's `rowsToHeight` / `expandWindow`, using "Card view initial / expanded rows max". Double-clicking the header expands or shrinks the view.
- **Selection counts**. `SelectionCount` shows a count while drag-selecting (beside the marquee) and the total selected in the seat (`GameView`). There is one toggle for each.
- **Keep game chat focused**. With it on, clicking the board returns focus to the game chat input (`utils/keepChatFocus.ts`).
- **Animations**:
  - The options are "Enable all" / "Disable all", tap animation, arrow draw-in (`useArrowDrawIn`), the life counter flash (`ui/ValueFlash`, `PlayerCounter`) and the battlefield damage flash (`TableZone`).
  - Until the user picks an option, `prefers-reduced-motion: reduce` turns the animations off. Once they pick one, their choice stands (`useAnimationPreferences`).
  - Migration v3 counts an existing "tap animation off" as a choice the user has made.
- **Use game time in game logs**.
  - Live game events carry no game time; Servatrice sets `seconds_elapsed` only on recorded containers. So Datatrice stamps each `GameMessage` with `gameSeconds`, from the game's start time and the last time a server event synced it.
  - A replay syncs from the container's `seconds_elapsed`: Sockatrice exposes it as `replayGameTime`, and Datatrice handles it in `gameTimeSynced`.
  - With the option on, ChatLog shows `mm:ss` (or `h:mm:ss`) in place of the local clock time.
- **Annotate card text on tokens** (off by default). A token created from the related-cards menu or the token dialog has its oracle text as its annotation. The text comes from the card catalogue's face `text`, which PR 20 added.
- **Card presentation (LONG-012), following the AppearanceSettingsPage in its order**:
  - Display card names: names over the art, shown when the image is missing as well.
  - Auto-rotate sideways-layout cards: split, battle and other landscape cards open rotated in the preview.
  - Scale cards on hover: the hover scale is 1.1.
  - Round card corners.
  - Maximum font size for card text, which sizes the over-art text.
  - Card view initial and expanded row counts.
  - Six card counter colours, with desktop's `QColor::fromHsv(id×60,150,255)` defaults.
  - Show keyboard shortcuts in right-click menus.
  - Bump sets the deck already holds to the top of the printing picker (`printingOrder.ts`).
  - The values are applied as root CSS variables by `useApplyCardPresentation`, which `AppThemeProvider` mounts.
- **Zone backgrounds**. The hand, stack, table and player-info areas each take an image, using PR 23's playmat storage and picker (`ZoneBackgroundsEditor`, `ui/ZoneBackground`, `PlaymatArt`).
- **Board colours as tokens (orchestrator M1)**.
  - The selection, attach and doesn't-untap rings, the marquee, the over-art text and its shadow, the modified-P/T orange, the life flashes and the mana tints were all hard-coded. They now come from PR 21's semantic tokens in both palettes: `--seat-select`, `--seat-attach`, `--seat-doesnt-untap`, `--seat-flash-gain/loss`, `--over-art-text/backdrop`, `--pt-modified` and `--mana-w..o`.
  - Tailwind has matching colour aliases.
  - Contrast assertions in `palettes.spec` cover the colours that carry meaning.
  - The dark theme looks the same as before. The light palette darkens the attach and doesn't-untap rings so they show on a light background.

## Parity rows closed
- **LONG-010**: closed for the game rows (all of the items above).
  - Use tear-off menus: N/A. A browser has no tear-off menus.
  - Home tab settings: N/A. Webatrice has no home tab.
  - Style user list: follow-up. It needs styled user rows.
  - Game filter toolbar: follow-up. There is no quick-filter toolbar yet.
- **LONG-012**: closed.
  - Theme folders: N/A. Themes are PR 21's palettes, not folders on disk.
  - Override all card art with personal preference: follow-up. It needs per-card art overrides.
  - Desktop's tally type: follow-up.
  - Per-player zone background variants: not ported. Backgrounds apply to every seat.

## Desktop reference
`vendor/cockatrice` at `add65caa`:
- `interface/widgets/settings_page/{appearance,user_interface,messages}_settings_page.cpp` (labels, order, defaults); `settings/cache_settings.cpp`.
- `game/zones/select_zone.cpp` (`computeZoneLayout`, `calcDropIndexFromY`), `game/zones/hand_zone.cpp`, `game/player/player_graphics_item.cpp` (`rearrangeZones`), `game/game_scene.cpp` (multi-column).
- `game/board/card_item.cpp` (`handleClickedToPlay`), `game/player/player_actions.cpp` (`playCard`), `game/zones/table_zone.cpp` (`toggleTapped`, damage shimmer).
- `game/phase.cpp` (`getLastSubphase`), `game/board/arrow_item.cpp` (draw animation), `game/board/counter_general.cpp`/`player_counter.cpp` (flash).
- `game/game_view.cpp` (selection counts), `game/zones/view_zone_widget.cpp` (`rowsToHeight`, `expandWindow`, search focus).
- `interface/widgets/server/message_log_widget.cpp` / `game_widget` time stamps; `common/pb/game_replay.proto` `seconds_elapsed`.

## Testing
- `npx turbo run typecheck --concurrency=1`: 5/5 tasks pass. Each commit was also typechecked on its own.
- `npm run lint`: 3/3 pass.
- `npm test -- -- --maxWorkers=2`: Sockatrice 896, Datatrice 1316, Webatrice 3542 (456 files). All pass.
- `npm run test:integration -- -- --maxWorkers=2`: Sockatrice 175, Datatrice 144, Webatrice 266. All pass.
- Sockatrice e2e: 5 passed (4 files).
- Webatrice e2e, against Servatrice 3.0.0 in the `mcr.microsoft.com/playwright:v1.60.0-noble` container, on chromium, firefox and webkit: **66 passed, 12 skipped, 0 failed**.
  - The 12 skips are the specs' own gates for 3.1-only features (deck sharing, reports).
  - In the first run, `staff-tools › an admin publishes a new server message` failed on all three browsers with `docker: unknown flag: --env-file`. That run mounted the docker CLI without its compose plugin. Re-run with `/usr/libexec/docker/cli-plugins` mounted: 6/6 passed.
  - The known proxy-CA failures did not happen in this run.
- New specs:
  - `seatGrid`, `verticalPile`, `useSeatClickToPlay`, `arrowLifetime`, `cardViewHeight`, `useValueFlash`, `SelectionCount`, `PreviewCardImage`, `ZoneBackground`, `keepChatFocus`
  - `ChatLog`, `useAnimationPreferences`, `useApplyCardPresentation`, `ZoneBackgroundsEditor`, `SeatCard`, `printingOrder`
  - Settings migration v3, `palettes.spec` token contrast
  - Datatrice `gameSeconds` / `gameTimeSynced`, Sockatrice `replayGameTime`
  - Integration: `replay.spec` (game time).

## Notes for reviewers
- **Changes to existing specs, each with a behavioural reason:**
  - `PlayerBoard.characterization`: a group tap now sends only the cards that change (`toggleTapped`).
  - Arrow expectations in `Game.orchestration`, `Game.seatComposition`, `GameBoardCell` and `usePlayerTargetCommands` now carry `deleteInPhase: Phase.FirstMain` (the subphase lifetime).
  - The swatches in the `Game.cardMenus` snapshot are now `var(--card-counter-N, #default)`.
- **A pre-existing integration race was fixed.** In `invite-link.spec`, the MUI dialog's exit transition leaves the page `aria-hidden`. It reproduced on base when another file runs in parallel. The spec now uses `findByRole` for the back button.
- **Defaults that changed to desktop's values:**
  - The stack step is two-thirds of a card (it was 35%).
  - The hover scale is 1.1.
  - The counter colours are desktop's exact defaults.
- **Decisions:**
  - The arrow draw-in has no sheen.
  - Game time is computed on the client (see Summary).
  - A zone-view size the user has stored wins over the row-count height.
  - The zone view's search field is hidden while "keep game chat focused" is on, because desktop's field would steal focus.
- **Light theme:** checked against the `palettes.spec` contrast assertions. Nobody has looked at it with screenshots yet.
- **Follow-ups:**
  - Double-click play from the zone view (its CardSlot layer is not rendered yet).
  - During a replay's backward skip, suppress the life and battlefield flashes.
  - The N/A and follow-up rows listed above.
- **Changesets:** `sockatrice-replay-game-time` (minor), `datatrice-game-log-game-time` (minor), `webatrice-board-preferences` (minor).
