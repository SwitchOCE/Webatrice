# refactor(layout): split TopBar

## Summary

- Behaviour-preserving split of `feature-wrappers/layout/TopBar.tsx` (906 lines → 275), the aud2 TopBar row. The view owned four state models; each now has one owner with a spec:

| Before (in `TopBar.tsx`) | After |
|---|---|
| Tab types, route → tab mapping (`detectTransientTab`), titles, `routeMatches`, deck-name flatten; the sticky predicate and the `deck:(\d+)` parse each written twice | `layout/topBarTabs.ts` (pure): `isStickyTabType`, `deckIdOfTab`, `addStickyTab`, `withDeckNames`, `flattenDeckNames`, `detectTransientTab`, `tabTitle`, `routeMatches` |
| Sticky-tab module singleton + `useSyncExternalStore` + `localStorage`, `isValidPersistedTab`, legacy retitle | `layout/hooks/useStickyTabs.ts` |
| Identity-change detection with its own storage key | `layout/hooks/useIdentityChange.ts` |
| Deck-list request on connect + id → name map | `layout/hooks/useBackendDeckNames.ts` (TODO(R3)) |
| Last-route persistence, imported by `AppShell` from the view | `services/storage/lastRoute.ts` (store) + `layout/hooks/usePersistLastRoute.ts`; `AppShell` imports from `@app/services` |
| Direct `window.localStorage` calls | `services/storage/localStorage.ts`: `readLocalStorage` / `writeLocalStorage`, which never throw |
| `UserMenu`, `TabList` inner components | `layout/UserMenu.tsx`, `layout/TabList.tsx` |

- TopBar calls the hooks in the order its effects ran before. This matters: the visit that pins a deck tab still runs before the identity check that purges deck tabs.
- PR 26's Menu/focus behaviour, PR 27's nav/link semantics and PR 28's render-time titles moved unchanged. Their existing specs in `TopBar.spec.tsx` pass untouched.
- The layout barrel no longer exports `loadPersistedLastRoute`.
- **Deck-list fetch (D6):** R3 (the shared `hooks/useBackendDeckList.ts`) has not landed. `useBackendDeckNames` carries a `TODO(R3)`, and so does `flattenDeckNames`.

Commits, oldest first. Every one typechecks and is green:
1. characterization specs;
2. `topBarTabs.ts`;
3. hooks and the storage service;
4. `UserMenu` / `TabList`;
5. storage-blocked spec and changeset.

### Behaviour fix (separate from the refactor)

- **TopBar no longer throws when the browser blocks local storage.** This is the audit's "localStorage is called directly although a storage service exists". Saved tabs and the last route already used try/catch. The identity check did not: it called `window.localStorage.getItem`/`setItem` directly in an effect, so a browser that blocks storage threw from TopBar. It now goes through the non-throwing helpers. The spec `TopBar without local storage › still renders…` failed against the pre-split TopBar (`SecurityError: blocked`) and passes now.

## Parity rows closed

None from the parity matrix. This closes the aud2 §2 TopBar row: the sticky store, last route, identity change and deck-name enrichment are split out, and `UserMenu`/`TabList` are extracted. The D6 deck-list part waits for R3.

## Desktop reference

No desktop behaviour changes. The only desktop citation in this code moved as is with `detectTransientTab`: an unsaved draft opens in the editor tab, `cockatrice/src/interface/widgets/tabs/tab_supervisor.cpp:989-999`. At `add65ca` it points at `TabGame::openDeckEditor` → `openDeckInNewTab` (`:988`, `:998`).

## Testing

- Characterization specs came first, against the unsplit TopBar (`TopBar.spec.tsx`, +10 cases; 26 → 37 with the storage-blocked case). They pin:
  - the request shapes: `session.deckList()` on connect and never when the list is loaded or the client is offline; `rooms.leaveRoom(1)`; `authentication.disconnect()`;
  - the fall-back to the Lobby when the current tab closes;
  - sticky persistence: saved without handlers, transient pages never saved, closed tabs dropped from storage;
  - restore on load: malformed entries and unknown types dropped, translated legacy titles re-derived;
  - deck-tab naming from the deck list, saved back to storage;
  - the last-route mirror.
- New specs:
  - `topBarTabs.spec.ts` (34);
  - `hooks/useStickyTabs.spec.ts` (8);
  - `hooks/useIdentityChange.spec.tsx` (6);
  - `hooks/useBackendDeckNames.spec.tsx` (3);
  - `hooks/usePersistLastRoute.spec.tsx` (1);
  - `UserMenu.spec.tsx` (8);
  - `TabList.spec.tsx` (4);
  - `services/storage/lastRoute.spec.ts` (3);
  - `services/storage/localStorage.spec.ts` (3).
- Gate (Windows, at the tip `7527c61f` on base `fork/claude/restack-25a-platform-prefs` @ `c9c05e94`): unit and integration ran before the last rebase, which changed only the e2e `startup-tab.spec.ts` under this branch; typecheck, the layout/storage specs (130/130) and e2e ran after it.
  - `turbo run typecheck`: 5/5 tasks.
  - `npm run lint`: 3/3 tasks.
  - `i18n:check`: 103 catalogues, all keys resolve.
  - Unit tests: sockatrice 897/897 (43 files) and datatrice 1316/1316 (35 files). Webatrice 3963/3963 (485 files), run in two chunks: `src/features/game` 1326 (144 files) and the rest 2637 (341 files). Run in one go under turbo, webatrice's vitest exited without a summary.
  - Integration tests: sockatrice 175, datatrice 145, webatrice 271. All green.
  - e2e (webatrice, chromium + firefox + webkit, 3.0.0 image): 105 tests (chromium 37, firefox 35, webkit 35): 92 passed, 12 skipped, 1 failed. The failure is `[chromium] decks.spec.ts:11` (deck folders round-trip): the New folder name field is empty when Create is clicked, so the folder never appears. It passed on firefox and webkit. It is a pre-existing chromium flake: re-run alone on chromium it passed 2/3 at this branch's tip and 2/5 on the base `c9c05e94`, failing the same way. The specs touch no deck-page code.

## Notes for reviewers

- **DECISION: sticky-tab store location.** It lives in `feature-wrappers/layout/hooks/`, not root `hooks/`, for two reasons:
  - it stores the layout-owned `Tab` type;
  - restore uses `detectTransientTab` to retitle legacy tabs, and the boundaries forbid root `hooks/` from importing `feature-wrappers`.
  The file follows the `usePhaseTrackPinned` idiom (module singleton + `useSyncExternalStore`), and its spec reloads the module with `vi.resetModules()`.
- **DECISION: last route lives in `services/storage/lastRoute.ts`**, not `layout/lastRoute.ts` as aud2 sketched. `AppShell` reads it at boot, before any chrome renders, so it belongs to a root layer, and `AppShell` no longer reaches into the layout for it.
- **DECISION: "via StorageService".** `StorageService.ts` covers IndexedDB and storage quota, not `localStorage`. I added the two small `localStorage` helpers next to it in `services/storage/` rather than growing it. Only TopBar's call sites move. The other direct `localStorage` users (`usePhaseTrackPinned`, `useSnapGridVisible`, the game panels, …) are left for a follow-up.
- `useIdentityChange` keeps the callback in a ref, updated at render as `Menu` does. The effect still runs on identity changes only, as the old effect did with its `exhaustive-deps` suppression, and that suppression is gone.
- **`i18n-default.json` diff:** the pre-commit `translate` hook rewrote it in Windows `readdir` order, so the first commit (`0b6031c3`) carries a key-order-only change (440 lines, no key or value changes). `i18n:check` compares deep-equal and passes. Drop it the same way as R4's 08b50ca, or with the sorted-rollup fix planned for the final restack.
- **Follow-up (not fixed, no behaviour change allowed here):** `VALID_TAB_TYPES` omits `'shortcuts'`, although `shortcuts` is a sticky type. A pinned Shortcuts tab is saved but dropped on the next load. Fixing it is one word in `useStickyTabs.ts` plus a spec.
- Follow-up: once R3 lands, swap `useBackendDeckNames`' fetch and `flattenDeckNames` for `useBackendDeckList` (D6).
