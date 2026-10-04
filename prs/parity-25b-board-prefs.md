# feat(game): desktop's board preferences and card presentation options

> **Stacks on claude/restack-16-game-lobby** (`d2e516c`). Branch `claude/parity-25b-board-prefs`: the original 21 commits, plus 21 review-fix commits on top (rv17, no history rewrite).

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
  - Shift plays it face down onto tablerow 2.
  - From the stack, a spell goes to the graveyard and anything else goes onto the battlefield.
  - On the battlefield a click taps or untaps the card.
  - "Clicking plays all selected cards" plays the whole selection, highest card id first, when the clicked card is in it. On the battlefield the click toggles the whole selection, as `TableZone::toggleTapped` does. A single click reads the selection from before the click, which `useSeatDnd` hands to it.
  - A judge may click-play and click-tap any seat's cards (`getLocalOrJudge`). Only Alt on its own blocks the play; Alt+Shift still plays face down.
- **Do not delete arrows inside subphases** (on by default). An arrow's `delete_in_phase` is now the phase after its subphase group (`getSubPhasesEnd` + 1; `utils/arrowLifetime.ts`), so an arrow drawn while declaring attackers lasts through combat damage. With the option off the field is left unset, as desktop does (`card_item.cpp:283-287`), and Servatrice deletes the arrow on the next phase change.
- **Auto focus the zone view search bar**. The zone view's search takes focus when the view opens. The view's height follows desktop's `rowsToHeight` / `expandWindow`, using "Card view initial / expanded rows max", never taller than the zone's contents. Double-clicking the header, or its expand button, expands or shrinks the view.
- **Selection counts**. `SelectionCount` shows a count while drag-selecting (beside the marquee) and the total selected in the seat (`GameView`). There is one toggle for each. Screen readers hear the total in words ("3 cards selected") from a status region that stays mounted.
- **Keep game chat focused**. With it on, clicking the board returns focus to the game chat input (`utils/keepChatFocus.ts`).
- **Animations**:
  - The options are "Enable all" / "Disable all", tap animation, arrow draw-in (`useArrowDrawIn`), the life counter flash (`ui/ValueFlash`, `PlayerCounter`) and the battlefield damage flash (`TableZone`).
  - Until the user picks an option, `prefers-reduced-motion: reduce` turns the animations off. Once they pick one, their choice stands (`useAnimationPreferences`).
  - **One motion policy for the whole board.** Desktop has no switch for the board's other motion, so it follows the four: `boardAnimationsAllowed` is off once all four are off (what "Disable all" and the unchosen reduced-motion default resolve to). It stops the draw flights (`useDrawFlights`), the framer-motion hand slide (`BoardMotionConfig`), and, through `<html data-animations="off">` and `styles/board-motion.css`, the card flip, the end step phase flash, the hover-scale and the card slot transitions. The settings text says so.
  - A replay's backward skip plays without the life flash, the damage wash or the tap animation, as desktop's `SKIP_DAMAGE_ANIMATION` / `SKIP_TAP_ANIMATION` (`ReplayEngine.getRewindCount`, `useJustRewound`).
  - The damage wash only reacts to a loss: a gain neither flashes nor cuts off a running wash.
  - The arrow draw-in plays when the game adds an arrow (`useArrivingArrows`), not when its shape mounts, so joining a game in progress or a remount draws nothing.
  - Migration v3 counts an existing "tap animation off" as a choice the user has made, and also turns the three new animations off for that user.
- **Use game time in game logs**.
  - Live game events carry no game time; Servatrice sets `seconds_elapsed` only on recorded containers. So Datatrice stamps each `GameMessage` with `gameSeconds`, from the game's start time and the last time a server event synced it.
  - A replay syncs from the container's `seconds_elapsed`, when the container carries one (`isFieldSet`): Sockatrice exposes it as `replayGameTimeSynced`, and Datatrice handles it in `gameTimeSynced`. A replay keeps that one time base: `gameInfoUpdated` does not overwrite it with `Event_GameStateChanged`'s count, which starts when the game was created.
  - With the option on, ChatLog shows the game time as `hh:mm:ss` (`formatElapsed`) in place of the local clock time.
- **Annotate card text on tokens** (off by default). A token created from the related-cards menu or the token dialog has its oracle text as its annotation. The text comes from the card catalogue's face `text`, which PR 20 added.
- **Card presentation (LONG-012), following the AppearanceSettingsPage in its order**:
  - Display card names: names over the art, shown when the image is missing as well.
  - Auto-rotate sideways-layout cards: split, battle and other landscape cards open rotated in the preview.
  - Scale cards on hover: the hover scale is 1.1.
  - Round card corners.
  - Maximum font size for card text, which sizes the over-art text, in fixed pixels (at least 9), as desktop does.
  - Card view initial and expanded row counts, kept initial ≤ expanded as desktop's coupled spin boxes do.
  - Six card counter colours, with desktop's `QColor::fromHsv(id×60,150,255)` defaults.
  - Show keyboard shortcuts in right-click menus.
  - Bump sets the deck already holds to the top of the printing picker (`printingOrder.ts`), most copies first (see Decisions).
  - The values are applied as root CSS variables by `useApplyCardPresentation`, which `AppThemeProvider` mounts.
- **Zone backgrounds**. The hand, stack, table and player-info areas each take an image, using PR 23's playmat storage and picker (`ZoneBackgroundsEditor`, `ui/ZoneBackground`, `PlaymatArt`). The table's background is drawn only where there is no playmat (`usePlayerPlaymat`), as desktop does. Each row's buttons are named after its zone.
- **Board colours as tokens (orchestrator M1)**.
  - The selection, attach and doesn't-untap rings, the marquee, the over-art text and its shadow, the modified-P/T orange, the life flashes and the mana tints were all hard-coded. They now come from PR 21's semantic tokens in both palettes: `--seat-select`, `--seat-attach`, `--seat-doesnt-untap`, `--seat-flash-gain/loss`, `--over-art-text/backdrop`, `--pt-modified` and `--mana-w..o`.
  - Tailwind has matching colour aliases.
  - Contrast assertions in `palettes.spec` cover the colours that carry meaning.
  - The dark theme looks the same as before. The light palette darkens the attach and doesn't-untap rings so they show on a light background; every other board colour is the same in both palettes (the colours drawn over art are pinned identical in `palettes.spec`).

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
Final tip (after the rv17 fixes):
- `npx turbo run typecheck --concurrency=1`: 5/5 tasks pass.
- `npm run lint`: 3/3 pass.
- `npm test -- -- --maxWorkers=2`: Sockatrice 898 (42 files), Datatrice 1317 (35 files), Webatrice 3576 (458 files). All pass.
- `npm run test:integration -- -- --maxWorkers=2`: Sockatrice 175, Datatrice 144, Webatrice 266. All pass.
- Sockatrice e2e: 5 passed (4 files).
- Webatrice e2e, against Servatrice 3.0.0 in the `mcr.microsoft.com/playwright:v1.60.0-noble` container (docker CLI and compose plugin mounted), on chromium, firefox and webkit: **66 passed, 12 skipped, 0 failed**.
  - The 12 skips are the specs' own gates for 3.1-only features (deck sharing, reports).
  - No proxy-CA failures in this run.
- New specs:
  - `seatGrid`, `verticalPile`, `useSeatClickToPlay`, `arrowLifetime`, `cardViewHeight`, `useValueFlash`, `SelectionCount`, `PreviewCardImage`, `ZoneBackground`, `keepChatFocus`
  - `ChatLog`, `useAnimationPreferences`, `useApplyCardPresentation`, `ZoneBackgroundsEditor`, `SeatCard`, `printingOrder`
  - Settings migration v3, `palettes.spec` token contrast
  - Datatrice `gameSeconds` / `gameTimeSynced`, Sockatrice `replayGameTime`
  - Integration: `replay.spec` (game time).
  - rv17: `board-motion.spec`, `BoardMotionConfig`, `ReplayEngine` rewind count, `Battlefield › damage wash` and `› table background`, arrow arrival cases, Sockatrice unset/zero `seconds_elapsed`, the replay time-base reducer spec, coupled row boxes, the card view expand cap and button, `TotalSelectionCount` live region, `ZoneBackgroundsEditor` names with the English catalogue, the composited over-art contrast.

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
  - The printing bump puts the most copies first and counts every printing. Desktop's code says it does that but its prepend loop leaves the fewest first and only looks at each set's first printing (`printing_selector_card_sorting_widget.cpp:211-232`); this follows desktop's stated intent and the doc comment records the departure.
- **Light theme:** checked against the `palettes.spec` contrast assertions. Nobody has looked at it with screenshots yet.
- **Follow-ups:**
  - Double-click play from the zone view (its CardSlot layer is not rendered yet).
  - The N/A and follow-up rows listed above.
- **Changesets:** `sockatrice-replay-game-time` (minor), `datatrice-game-log-game-time` (minor), `webatrice-board-preferences` (minor).

## Review response (rv17)
No history rewrite (task f25b): every finding is a new commit on af3cfc1.

| finding | what changed |
|---|---|
| major: Disable all / reduced motion left board motion running | `boardAnimationsAllowed` / `useBoardAnimations` gate the draw flights, the hand spring (`BoardMotionConfig` → `MotionConfig reducedMotion`), and via `<html data-animations>` + `board-motion.css` the card flip, phase flash, hover-scale and CardSlot transitions. The card flip's own media query is gone, so the policy is the only gate. The i18n description now says what stops. Specs: `useAnimationPreferences` (policy + root attribute), `BoardMotionConfig`, `useDrawFlights`, `board-motion.spec` (computed styles from the real stylesheets). |
| migration v3 enabled three animations for users who had animation off | the same branch sets them off; the spec covers both prior states |
| judge click-play | gated on the seat's `canAct` (`computeCanAct`, desktop's `getLocalOrJudge`); judge spec in `StackColumn.spec` |
| life gain cut off the damage wash | `useValueFlash(…, { only: 'loss' })`; spec |
| replay backward seek fired flashes | `ReplayEngine.getRewindCount` + `ReplayRewindProvider` + `useJustRewound`; the life flash, the damage wash and the tap animation skip the rewound render (desktop's SKIP_DAMAGE_ANIMATION and SKIP_TAP_ANIMATION) |
| arrow draw-in on mount | `useArrivingArrows`: seeded at the first measurement, remembers drawn arrows; specs for a game in progress, an endpoint that goes missing and comes back, and a new arrow |
| `secondsElapsed ?? 0` | `isFieldSet(container, GameEventContainerSchema.field.secondsElapsed)`; specs for unset and for 0 |
| two replay time bases | `gameInfoUpdated` leaves a replay's clock alone; reducer spec |
| max font size scaled with the card | `max(9, size)px`, as desktop |
| expand not limited by contents | the contents' height caps both directions; spec |
| initial rows > expanded rows | number controls can push a coupled box (`pushes`), used by the two row counts; the zone view also uses max(expanded, initial); specs |
| table ZoneBackground under a playmat | `usePlayerPlaymat`; the battlefield draws one or the other; spec |
| vertical hand re-rendered on hover | `hover:!z-[999]`, state removed |
| over-art contrast assertion could not fail | composites the selection labels' real backdrop (opacity read from the component) over white; mana, life heart and flashes pinned identical across palettes |
| changeset overstated the light theme | reworded; also covers the motion policy, px font and expand |
| SelectionCount live region | stable `sr-only` status node with an i18n plural; badge `aria-hidden` |
| ZoneBackgroundsEditor names | zone-specific i18n `aria-label`s, `aria-expanded` / `aria-controls` on Edit; spec with the real English catalogue |
| expand/shrink keyboard path | header button with i18n label and `aria-pressed` |
| damage wash spec | `Battlefield.spec › damage wash` (loss, gain, gain mid-wash, option off, rewind) |
| play-all-selected closure accident | `onCardClick` receives the pre-click selection explicitly; specs in `useSeatDnd` and `useSeatClickToPlay` |
| nit: Alt combinations | only Alt on its own blocks (desktop compares the whole modifier set); Alt+Shift spec |
| nit: printing order | kept most-first and every printing; documented as a deliberate departure from desktop's buggy prepend loop (see Decisions) |
| nit: name while loading | the name shows until `onLoad` (`CardImage` reports it) |
| nit: counter colours twice | `DEFAULT_COUNTER_COLORS` derives from `PREFERENCE_DEFAULTS` via `CARD_COUNTER_COLOR_KEYS` |
| nit: `useAnimationPreference` re-implemented `resolveAnimation` | one shared helper |
| nit: global clip id | `useId()`-scoped, keyed by creator and id; React keys too (two players' arrow 1 no longer collide) |
| nit: `replayGameTime` name | `replayGameTimeSynced` (unreleased, so not breaking) |
| nit: two hard-coded colours | `border-over-art-backdrop/50`, new `over-art-life` token for the heart |
| nit: `vi.restoreAllMocks` in test bodies | moved to an `afterEach` |
| nit: commit hygiene (squash `verticalHandLayout.ts` churn, split the SETTINGS_VERSION bump, retitle db87cbe) | **not applied**: task f25b forbids rewriting history (R2 and R6 are built on af3cfc1 and will be replayed onto this tip). It can be done at the final restack or with a squash-merge. |
| nit: PR file's Arrows and Game-time bullets | fixed: `delete_in_phase` is unset with the option off, and the game time prints `hh:mm:ss` |

## Restack notes (wR4a)

Branch `claude/restack-25b-board-prefs`, tip `4f035da`, 40 commits on R1 (`af3cfc1` and `fd36e74` dropped).
- **Settings:** one number control: 25a's `NumberControl` (`unitKey`) commits through 25b's `clampWhole` and gains 25b's `pushes`; `suffixKey` rows use `unitKey`; the duplicate CSS goes.
- **Layout:** `useGameBoardLayout(game, rotation, minPlayersForMultiColumn)` keeps 17b's rotation and 25b's preference.
- **Click to play:** `useSeatClickToPlay` plays through R1's `playCardMove` (printed P/T, cipt); the battlefield click keeps desktop `TableZone::toggleTapped`. HandZone keeps R1/17a's arrow attributes and card menu on 25b's `renderOwnCard`.
- **Arrows:** `deleteInPhase` is sent from R1's single `createArrow` port; R1's specs expect it.
- **Selection count:** 17a's `TallyOverlay` count is gated by "Show total selection count"; 25b's `TotalSelectionCount` is dropped, and so is `fd36e74` (17a's review keeps the count silent).
- "Annotate card text on tokens" also covers 17a's hand-card token items; `keepFocusOnBoardPress` runs before R1's board mouse-down; `BoardMotionConfig` wraps the re-indented provider tree.
