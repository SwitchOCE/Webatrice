# refactor(game): share the zone-view dialog family

> **Stacks on `claude/parity-25b-board-prefs`** (`af3cfc1`). Branch `claude/parity-r2-zone-view-family`. Audit PR **R2** (`specs/aud2.md` §4), with duplicates **D3** and **D8**.

## Summary

The game's three floating card views (`ZoneViewPanel`, `IncomingRevealDialog`, `ZoneRevealPanel`) carried three copies of the same machinery, and the copies had drifted. They now share one set of modules in `features/game/dialogs/shared/`, so the later dialog work (PR 29's DialogShell chrome, PR 30's roving focus over one card cell, PR 32's toolbar strings) edits one module instead of three.

The work follows the PR 05/09 refactor order: characterization specs first, then the move, then the deletion.

- **Characterization first (`daa99d1`).** `ZoneViewPanel` had no spec of its own. Its new spec (23 tests) pins:
  - the storage keys and clamps;
  - the group, sort and pile choices and their defaults;
  - the catalog-metadata gate;
  - the search filter;
  - the marquee;
  - both card layouts, including the right-click scope (`shownIds` / `columnIds`).

  `ZoneRevealPanel` gets a 7-test spec. `IncomingRevealDialog` gains its live-snapshot behaviour, its loading state, its own stored choices and its geometry.
- **`dialogs/shared/`:**
  - `useFloatingPanelGeometry`: the stored size and position under a key prefix, one clamp, the header drag and the debounced writes. It takes an `openKey` to open the panel again, for a new reveal arriving in an open panel.
  - `zoneViewPreferences.ts` (moved here, extended) and `useZoneViewPreferences`: group, sort and pile choices, read and written under each view's own prefix, beside the existing shuffle-on-close choice.
  - `useCardCatalogMeta`: the batched, name-keyed catalog lookup and its `metadataLoaded` gate.
  - `zoneViewSort.ts` (moved here) gains `buildCardGroups` and `placeholderMeta`.
  - `ZoneCardGroups` and one `ZoneCardCell`, with a `renderCell` slot. The cell handles the pile strip, the hover preview and middle-click zoom, selection ring, drag hiding and grab cursor.
  - `ZoneViewControls`: the group and sort boxes and the pile-view toggle, so `TOOLBAR_SELECT_CLASS` now exists once.
  - `zoneLabels.ts` + `zoneLabels.i18n.json` (D8): one `ZoneName`-keyed map giving each zone's title-case and in-sentence name as i18n keys.
- **`ZoneViewPanel`** goes from 1104 to 461 lines. It keeps desktop's row-based height and title-bar expand, which 25b added, and passes them to the geometry hook as its `initialSize` callback.
- **`IncomingRevealDialog`** goes from 908 to about 200 lines:
  - `useIncomingReveal` owns the five selectors, the lent-drag policy (`canDragLent`) and the close, which dispatches `zoneViewCleared` + `incomingRevealDismissed`. This follows the `useZoneViewDialog` / `useZoneDialogActions` idiom.
  - The panel mounts only while a reveal is pending.
- **`ZoneRevealPanel`** uses the geometry hook and `ZoneCardCell`. Its server-ordered row and deck-position labels are unchanged.
- **Marquee:** `hooks/useMarquee` is the band itself: its state, the window pointer listeners, the live re-selection and the count. `useSeatMarquee` is now built on it, and the zone view uses it with its own hit test, so the view no longer carries its own copy. What each band selects is unchanged.

## Parity rows closed

None. This is a refactor. It removes the D3 and D8 duplicates and the IncomingRevealDialog layering break that aud2 lists.

## Behaviour changes (listed separately, as the task asks)

1. **One clamp for all three views.** The audit noted that "no copy is canonical (the clamp has diverged)". The shared rule:
   - A stored size is clamped between the panel's minimum and the viewport, and the viewport wins. Before:
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

Run from the repo root on `3242ea4`:

- `npx turbo run typecheck --concurrency=1`: 5/5 tasks passed.
- `npm run lint`: 3/3 packages, 0 problems.
- `npm test -- -- --maxWorkers=2`: sockatrice 896 passed, datatrice 1316 passed, webatrice **3615 passed** (466 files).
- `npm run test:integration -- -- --maxWorkers=2`: sockatrice 175, datatrice 144, webatrice **266 passed** (49 files).
- `npm run test:e2e -w @cockatrice/webatrice`: the app was built on the host, and Servatrice 3.0.0 + MySQL ran through `test:e2e:up`. The browsers ran inside `mcr.microsoft.com/playwright:v1.60.0-noble` on chromium, firefox and webkit: **63 passed, 3 failed, 12 skipped** (78 tests in 13.8 min).
  - The 3 failures were all `staff-tools.spec.ts` "an admin publishes a new server message", one per browser, with `spawnSync docker ENOENT`. Its SQL seeding needs the docker CLI, which the container lacked (the known environment gap from parity-28).
  - I re-ran `staff-tools.spec.ts` in the same image with the host's docker CLI, compose plugin and socket mounted: **6/6 passed** on all three browsers.
  - Net: **66 passed, 12 skipped, 0 failed**.

New or extended specs:

| Spec | Tests |
|---|---:|
| `ZoneViewPanel.spec` | 23 |
| `ZoneRevealPanel.spec` | 7 |
| `IncomingRevealDialog.spec` | 4 → 12 |
| `useIncomingReveal.spec` | 5 |
| `useFloatingPanelGeometry.spec` | 9 |
| `zoneViewPreferences.spec` | 5 |
| `useCardCatalogMeta.spec` | 3 |
| `ZoneCardGroups.spec` (groups + cell) | 6 |
| `ZoneViewControls.spec` | 2 |
| `zoneLabels.spec` | 2 |
| `useMarquee.spec` | 3 |
| `zoneViewSort.spec` (`buildCardGroups`) | +1 |

25b's behaviour stays pinned by the existing `ZoneViewDialog.spec` cases, which pass unchanged apart from the zone label (see Notes):

- search autofocus, and the setting that turns it off;
- the search box hidden under "keep game chat focused";
- the row-based initial and expanded heights;
- Escape in the search box.

The group, sort and pile choices are pinned by `ZoneViewPanel.spec`. As of 25b they are still per-view stored choices, not settings.

## Notes for reviewers

- **Zone names are translated, the sentences around them are not yet.** `zoneViewTitle` and the new `incomingRevealTitle` take `t` and translate the zone through the map. "Graveyard — P1" and "P2 reveals their library" are still composed in English, and their extraction is PR 32's.
  - I tried whole-sentence keys first. The test i18n instance echoes keys without interpolation, so the Game-level specs could no longer tell P1's views from P2's. They identify views by title, for example "closes a player's views when that player leaves, and keeps the others".
  - With label-only keys, rendered specs read `ZoneLabel.title.grave — P1`. The English is pinned by the pure title specs through a small `features/game/__test-utils__/catalogT.ts`, which reads the co-located catalogue.
- **The HandZone / StackColumn `lookupCard` follow-up from R4 is already resolved on this base** (orchestrator M1). On 25b, those components no longer call `lookupCard`: click-to-play goes through `useSeatClickToPlay` → `seatCardMetaFromLookup`. The direct calls exist only on R4's older base, so nothing changes here. The final restack keeps 25b's hook over R4's inline calls.
- **Left for PR 30:** the ZoneStack library-menu dedupe, as tasked.
- **Kept as they were, deliberately:**
  - While metadata loads, `ZoneViewPanel` piles by the user's grouping, but the incoming reveal by the effective (ungrouped) one. Each caller still passes its own `pile` flag to `ZoneCardGroups`.
  - Each view keeps its own storage prefix and keys: `webatrice.searchLibrary*`, `webatrice.incomingReveal*`, `webatrice.zoneReveal*`. Stored choices survive the upgrade.
- **`useSeatMarquee`'s band field** is now `start` (from `useMarquee`) rather than `startZone`. Only its own spec read it.
- **Changeset:** `.changeset/refactor-zone-view-family.md` (`@cockatrice/webatrice`: patch).
