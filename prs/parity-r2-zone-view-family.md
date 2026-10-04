# refactor(game): share the zone-view dialog family

> **Stacks on `claude/parity-25b-board-prefs`** (`0a67ce1`; restacked from `af3cfc1` in fr2). Branch `claude/parity-r2-zone-view-family`. Audit PR **R2** (`specs/aud2.md` §4), with duplicates **D3** and **D8**.

## Summary

The game's three floating card views (`ZoneViewPanel`, `IncomingRevealDialog`, `ZoneRevealPanel`) carried three copies of the same machinery, and the copies had drifted. They now share one set of modules in `features/game/dialogs/shared/`, so the later dialog work (PR 29's DialogShell chrome, PR 30's roving focus over one card cell, PR 32's toolbar strings) edits one module instead of three.

The work follows the PR 05/09 refactor order: characterization specs first, then the move, then the deletion.

- **Characterization first (`366335e`).** `ZoneViewPanel` had no spec of its own. Its new spec (23 tests at that commit) pins:
  - the storage keys and clamps;
  - the group, sort and pile choices and their defaults;
  - the catalog-metadata gate;
  - the search filter;
  - the marquee;
  - both card layouts, including the right-click scope (`shownIds` / `columnIds`).

  `ZoneRevealPanel` gets a 7-test spec. `IncomingRevealDialog` gains its live-snapshot behaviour, its loading state, its own stored choices and its geometry.
- **`dialogs/shared/`:**
  - `useFloatingPanelGeometry`: the stored size and position under a key prefix, one clamp (in the inline size and in the CSS minimums), the header drag and the debounced writes. It takes an `openKey` to open the panel again, for a new reveal arriving in an open panel.
  - `zoneViewPreferences.ts` (moved here, extended) and `useZoneViewPreferences`: group, sort and pile choices, read and written under each view's own prefix, beside the existing shuffle-on-close choice.
  - `useCardCatalogMeta`: the batched, name-keyed catalog lookup and its `metadataLoaded` gate.
  - `zoneViewSort.ts` (moved here) gains `buildCardGroups` and `placeholderMeta`.
  - `ZoneCardGroups` and one `ZoneCardCell`, with a `renderCell` slot. The cell handles the pile strip, the hover preview and middle-click zoom, selection ring, drag hiding and grab cursor.
  - `ZoneViewControls`: the group and sort boxes and the pile-view toggle, so `TOOLBAR_SELECT_CLASS` now exists once.
  - `zoneLabels.ts` + `zoneLabels.i18n.json` (D8): one `ZoneName`-keyed map giving each zone's title-case and in-sentence name as i18n keys. The titles around them are whole messages with `{player}`/`{zone}`/`{count}` placeholders (`useZoneViewDialog.i18n.json`, `IncomingRevealDialog.i18n.json`).
- **`ZoneViewPanel`** goes from 1135 lines (on 25b's tip) to 427. It keeps 25b's row-based initial height, its title-bar and header-button expand, and the expand's cap at the zone's contents: the initial height is the geometry hook's `initialSize` callback, and the expand stays in the panel.
- **`IncomingRevealDialog`** goes from 908 to 195 lines:
  - `useIncomingReveal` owns the five selectors, the lent-drag policy (`canDragLent`) and the close, which dispatches `zoneViewCleared` + `incomingRevealDismissed`. This follows the `useZoneViewDialog` / `useZoneDialogActions` idiom.
  - The panel mounts only while a reveal is pending.
- **`ZoneRevealPanel`** uses the geometry hook and `ZoneCardCell`. Its server-ordered row and deck-position labels are unchanged.
- **Marquee:** `hooks/useMarquee` is the band itself: its state, the window pointer listeners, the live re-selection and the count. `useSeatMarquee` is now built on it, and the zone view uses it with its own hit test, so the view no longer carries its own copy. What each band selects is unchanged.

## Parity rows closed

None. This is a refactor. It removes the D3 and D8 duplicates, and moves `IncomingRevealDialog`'s selectors and dispatches out of the component into `useIncomingReveal` (aud2), after the feature-hook idiom (`usePhaseBar`, `useMoveCard`).

## Behaviour changes (listed separately, as the task asks)

1. **One clamp for all three views.** The audit noted that "no copy is canonical (the clamp has diverged)". The shared rule:
   - A stored size is clamped between the panel's minimum and the viewport, and the viewport wins, in the inline size and in the CSS `min-width`/`min-height` (`min(<minimum>, 100vw/100vh)`, matching the panels' `max-w-screen`/`max-h-screen`). Before:
     - `IncomingRevealDialog` never clamped its stored size, so a size stored on a larger screen overflowed a smaller one;
     - `ZoneViewPanel` let the minimum win over a viewport smaller than 400×300.
   - A stored position keeps 60px of the header on screen, as `ZoneViewPanel` already did. Before, the two reveal views forced the whole panel on screen. Now all three restore a position the user dragged partly off screen, as the zone view always has.

   The two reveal characterization specs change for this, in the commits that make the change.
2. **The dead `?? reveal.cards` fallback is gone.** `getRevealedCards` answers an empty list for a missing snapshot, so the incoming reveal's fallback to the event payload could never run. The first characterization spec claimed it did, but it had passed `undefined` into a defaulted parameter. The spec now pins the real behaviour: an unseeded snapshot lists no cards.
3. **A name the catalog leaves out of its answer counts as unknown** (placeholder metadata). Before, `ZoneViewPanel` would look the name up again on every render that changed the map. No user-visible change while the catalog answers every name, which `lookupCardsCached` does today.

## Desktop reference

- `cockatrice/src/game/zones/view_zone_widget.cpp`: the group, sort and pile-view controls (`:64`, `:197`, `:234-250`) and the settings persistence (`:161-165`). `cache_settings.cpp:383-384` gives the group-by-type and sort-by-name defaults.
- `view_zone_logic.cpp:92-124`: the reveal re-index, which the lent drag sends as `card_id`.
- `server_abstract_player.cpp:779`: Servatrice's write-permission check for a lent zone.

## Testing

Run from the repo root on `7f454bd` (after fr2's restack onto f25b `0a67ce1` and the rv19 fixes):

- `npx turbo run typecheck --concurrency=1`: 5/5 tasks passed.
- `npm run lint`: 3/3 packages, 0 problems.
- `npm test -- -- --maxWorkers=2`: sockatrice **898 passed**, datatrice **1317 passed**. Webatrice's run was OOM-killed (exit 137) while the three packages ran side by side on this 15 GB machine. Run alone (`npx vitest run --maxWorkers=2`), webatrice passed **3661 tests in 468 files**. Its vmThreads pool peaks at ~13.7 GB here, and so does the pre-fix tip `3e7e703` (3649 passed), so this is the machine, not the change.
- `npm run test:integration -- -- --maxWorkers=2`: sockatrice 175, datatrice 144, webatrice **266 passed** (49 files).
- `npm run test:e2e -w @cockatrice/webatrice`: the app was built on the host, Servatrice 3.0.0 + MySQL ran through `test:e2e:up`, and the browsers ran inside `mcr.microsoft.com/playwright:v1.60.0-noble` (host docker CLI, compose plugin and socket mounted for `staff-tools`) on chromium, firefox and webkit: **66 passed, 12 skipped, 0 failed** (78 tests in 11.3 min).
- Every commit of the restacked range (`366335e`..`3e7e703`) typechecks and passes `dialogs/` + `hooks/` (`git rebase -x`).

New or extended specs:

| Spec | Tests |
|---|---:|
| `ZoneViewPanel.spec` | 26 |
| `ZoneRevealPanel.spec` | 7 |
| `IncomingRevealDialog.spec` | 4 → 14 |
| `useIncomingReveal.spec` | 5 |
| `useFloatingPanelGeometry.spec` | 15 |
| `zoneViewPreferences.spec` | 5 |
| `useCardCatalogMeta.spec` | 3 |
| `ZoneCardGroups.spec` (groups + cell) | 6 |
| `ZoneViewControls.spec` | 2 |
| `zoneLabels.spec` | 2 |
| `useMarquee.spec` | 3 |
| `zoneViewSort.spec` (`buildCardGroups`) | +1 |
| `useZoneViewDialog.spec` (`zoneViewTitle`) | +1 |

25b's behaviour stays pinned by the existing `ZoneViewDialog.spec` cases, which pass unchanged apart from the zone label (see Notes), with f25b's header expand button, its cap at the contents and initial ≤ expanded:

- search autofocus, and the setting that turns it off;
- the search box hidden under "keep game chat focused";
- the row-based initial and expanded heights;
- Escape in the search box.

The group, sort and pile choices are pinned by `ZoneViewPanel.spec`. As of 25b they are still per-view stored choices, not settings.

## Notes for reviewers

- **Restacked onto f25b (fr2); don't trust a clean auto-merge here.** Rebasing onto `0a67ce1` gave textual conflicts in `ZoneViewPanel.tsx` (the imports, the deleted storage helpers beside f25b's `contentsHeight`, the initial-size block, the expand) and `i18n-default.json`. They are resolved as f25b's behaviour in R2's structure: `contentsHeight` caps both the `initialSize` callback and `toggleExpanded`, which stays in the panel. The header expand button needed no hook change, because `onHeaderPointerDown` already ignores buttons. `ZoneViewDialog.spec.tsx` auto-merged cleanly but was broken: f25b's three new expand cases found the view by `/^Graveyard/`, which R2's test i18n renders as `ZoneLabel.title.grave — P1`. They now use the spec's `GRAVE` regex, in the D8 commit (`e4ce83d`) that changes the label. `i18n-default.json` was regenerated with `npm run translate`. Every commit of the restacked range typechecks and passes `dialogs/` + `hooks/`.
- **Titles are whole messages.** `zoneViewTitle` and `incomingRevealTitle` translate one message each, with the zone's own key interpolated as `{zone}`. The rendered specs tell views apart by the player in their titles, which a key-only test i18n drops, so the test i18n instance (`renderWithProviders`) now loads these two catalogues and formats them with ICU, as the app does. Every other key still renders as itself, so rendered titles read `ZoneLabel.title.grave — P1`, as before. The pure title specs pin the English, and a reordered (German-shaped) catalogue, through `features/game/__test-utils__/catalogT.ts`.
- **Toolbar strings stay with PR 32.** `ZoneViewControls` ("Group by Type", "pile view") and `IncomingRevealDialog` ("loading card details…") still carry their English literals. They are moved strings, not new ones, and now live once, so PR 32's extraction is one file each. Extracting them here would change the selectors of six spec files that select by that English.
- **The HandZone / StackColumn `lookupCard` follow-up from R4 is already resolved on this base** (orchestrator M1). On 25b, those components no longer call `lookupCard`: click-to-play goes through `useSeatClickToPlay` → `seatCardMetaFromLookup`. The direct calls exist only on R4's older base, so nothing changes here. The final restack keeps 25b's hook over R4's inline calls.
- **Left for PR 30:** the ZoneStack library-menu dedupe, as tasked.
- **Kept as they were, deliberately:**
  - While metadata loads, `ZoneViewPanel` piles by the user's grouping, but the incoming reveal by the effective (ungrouped) one. Each caller still passes its own `pile` flag to `ZoneCardGroups`.
  - Each view keeps its own storage prefix and keys: `webatrice.searchLibrary*`, `webatrice.incomingReveal*`, `webatrice.zoneReveal*`. Stored choices survive the upgrade.
- **`useSeatMarquee`'s band field** is now `start` (from `useMarquee`) rather than `startZone`. Only its own spec read it.
- **Changeset:** `.changeset/refactor-zone-view-family.md` (`@cockatrice/webatrice`: patch).

## Review response (rv19)

| finding | response |
|---|---|
| major: restack hazard with f25b, silently broken `ZoneViewDialog.spec` | Restacked onto `0a67ce1` as f25b behaviour in R2 structure; the three f25b expand cases use `GRAVE`; i18n regenerated. See Notes. |
| major: size persistence untested (M4) | `1c9c9fb`: a capturing `ResizeObserver` in `useFloatingPanelGeometry.spec` (no store on the first observation, a store 500 ms after the last resize, a pending write dropped on close) and one rendered `ZoneViewPanel` case. |
| major: reopen on a new reveal half pinned (M5, M15) | `bcbdaee`: the hook spec drags, changes `openKey`, and expects the centre (or the stored position, clamped) with nothing stored; `IncomingRevealDialog.spec` sends a second reveal for the hand into an open, dragged panel and expects the new title, the opening size and the centre. |
| minor: "viewport wins" undone by CSS | `41b9d13`: the CSS minimums are `min(<minimum>, 100vw)` / `min(<minimum>, 100vh)`; hook and panel specs where the minimum exceeds the viewport. The changeset says so. |
| minor: ungrouped grid fallback untested (M22) | `3673852`: pile view stored on, grouping `none` → a `flex-wrap` grid; grouping again fans the cards. |
| minor: `ZoneViewPanel` clamp spec passes under both rules | Covered by `41b9d13`'s panel case (`innerWidth` 300, stored width 100 → 300px). |
| minor: half-translated titles | `7f454bd`: whole messages with interpolation; the test i18n loads those two catalogues (see Notes). |
| nit: line count | Updated: 1135 → 427 on f25b's base. |
| nit: "removes the layering break" | Reworded under Parity rows closed. |
| nit: toolbar literals | Left for PR 32, as the review allows; listed under Notes. |

### Mutation results (fr2, on `7f454bd`, against `dialogs/ hooks/ PlayerBoard/ Game*`)

| # | mutant | result | caught by |
|---|---|---|---|
| M1 | header-visible clamp 60→0 | killed | 6 failing: IncomingRevealDialog.spec.tsx, ZoneRevealPanel.spec.tsx, ZoneViewPanel.spec.tsx, useFloatingPanelGeometry.spec.ts |
| M2 | size clamp min-wins | killed | 3 failing: ZoneViewPanel.spec.tsx, useFloatingPanelGeometry.spec.ts |
| M3 | position stored on open | killed | 4 failing: IncomingRevealDialog.spec.tsx, useFloatingPanelGeometry.spec.ts |
| M4 | size stored on first ResizeObserver tick | killed | 2 failing: ZoneViewPanel.spec.tsx, useFloatingPanelGeometry.spec.ts |
| M5 | openKey dropped from position effect | killed | 3 failing: IncomingRevealDialog.spec.tsx, useFloatingPanelGeometry.spec.ts |
| M6 | default groupBy none | killed | 10 failing: Game.zoneViews.spec.tsx, IncomingRevealDialog.spec.tsx, ZoneViewPanel.spec.tsx, zoneViewPreferences.spec.ts |
| M7 | default pileView off | killed | 6 failing: ZoneViewPanel.spec.tsx, zoneViewPreferences.spec.ts |
| M8 | pileView written inverted | killed | 3 failing: ZoneViewPanel.spec.tsx, zoneViewPreferences.spec.ts |
| M9 | sortBy not persisted | killed | 3 failing: IncomingRevealDialog.spec.tsx, ZoneViewPanel.spec.tsx, zoneViewPreferences.spec.ts |
| M10 | metadataLoaded always true | killed | 4 failing: IncomingRevealDialog.spec.tsx, ZoneViewPanel.spec.tsx, useCardCatalogMeta.spec.ts |
| M11 | catalog-omitted name never answered | killed | 1 failing: useCardCatalogMeta.spec.ts |
| M12 | set dropped from meta | killed | 1 failing: useCardCatalogMeta.spec.ts |
| M13 | close skips zoneViewCleared | killed | 2 failing: IncomingRevealDialog.spec.tsx, useIncomingReveal.spec.ts |
| M14 | canDragLent ignores spectator | killed | 2 failing: Game.dragdrop.spec.tsx, useIncomingReveal.spec.ts |
| M15 | IRD openKey: reveal removed | killed | 1 failing: IncomingRevealDialog.spec.tsx |
| M16 | marquee band survives pointerup | killed | 4 failing: ZoneViewPanel.spec.tsx, useMarquee.spec.ts, useSeatMarquee.spec.ts |
| M17 | no text-selection block | killed | 2 failing: ZoneViewPanel.spec.tsx, useMarquee.spec.ts |
| M18 | zone-view search autofocus removed (25b) | killed | 1 failing: ZoneViewDialog.spec.tsx |
| M19 | dragged card not hidden | killed | 3 failing: ZoneCardGroups.spec.tsx, ZoneRevealPanel.spec.tsx, ZoneViewPanel.spec.tsx |
| M20 | pile strips full height | killed | 1 failing: ZoneCardGroups.spec.tsx |
| M21 | middle-click zoom removed | killed | 1 failing: ZoneCardGroups.spec.tsx |
| M22 | ungrouped view still piles | killed | 1 failing: ZoneViewPanel.spec.tsx |
| M23 | inline label uses title form | killed | 5 failing: IncomingRevealDialog.spec.tsx |
| M24 | header drag starts from a button | killed | 2 failing: ZoneViewPanel.spec.tsx, useFloatingPanelGeometry.spec.ts |

24/24 killed (rv19: 20/24).

## Restack notes (wR4a)

Branch `claude/restack-r2-zone-view-family`, tip `d30b7af`, 13 commits on 25b. 17a's read-only reveal menu (Hide, Clone, Select All, View related cards), window-local hide/selection and keyboard select move into `IncomingRevealPanel`; `ZoneCardCell` gains `cardOwner` (R1's `data-card-owner`/`data-card-zone`) and `interaction` props. From `fix(game): translate the zone views' and the reveal's titles whole` on, 28's ReportQueue spec bundle uses ICU `{status}` (the test i18n now formats with ICU), and f17's zone-view Tab spec names the view by its key.
