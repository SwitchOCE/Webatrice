# fix(webatrice): make the lint gate green and enforce it in CI

## Summary
- **Hooks lint is real now.** The source had `react-hooks/exhaustive-deps` disable comments, but the plugin was never installed, so ESLint reported each one as an unknown rule and checked no hooks. This PR installs `eslint-plugin-react-hooks@^7.1.1` and turns on only `rules-of-hooks` (error) and `exhaustive-deps` (warn). The React Compiler rule set stays off. There were no rules-of-hooks errors. Every exhaustive-deps finding was reviewed: each one is either fixed, or kept as a disable comment with a one-line reason.
- **Two real bugs fixed along the way.**
  - `LoginForm` had stopped wiring the Auto Connect checkbox to `onUserToggleAutoConnect`, which the code marks `@critical` as the only path that saves the preference. Ticking the box never saved it. It is wired again, with a regression spec.
  - Deck autosave could write one deck's contents under another deck's id. The `/deck/:deckId` route keeps `DeckEditor` mounted across deck switches. `scheduleSave` kept the `persistNow` from the first render (now it depends on `persistNow`), and `useDeckEditor` seeded its state from the module cache only on first mount, so switching to an already-cached deck kept the previous deck in state. The hook now re-seeds `deck`, `loading`, `notFound`, `saveState` and the saved signature whenever the id changes, and a pending edit is flushed to the deck it was made on. A new `useDeckEditor.spec.tsx` covers this.
- **Layering.** `useDeckEditor`'s autosave used the runtime `WebClient.instance` singleton, which broke the UI layering invariant (the `no-restricted-imports` error). It now receives the client from `useWebClient()`.
- **max-len (about 180 lines).** Reformatted, never disabled:
  - Class strings repeated within a file became named module constants, using the existing `'…' + '…'` style.
  - One-off class strings use the existing `[…].join(' ')` style. The pieces keep their original order, so the rendered class attribute is the same.
  - The shared select-chevron data URI moved to `features/decks/selectChevron.ts`.
  - The mass-land-denial regex is now built from one literal per alternative. Its `source` and `flags` were checked to be identical.
- **Boundaries (SOLID plan Phase 2, rows TB-01, TB-04, TB-05).**
  - `TopBar` moved to `feature-wrappers/layout/`.
  - The snap-grid and phase-track preference hooks moved to root `hooks/` with the same export names.
  - `TopBar` no longer clears the deck caches itself. It calls `onIdentityChanged()` on a new `ShellLifecycleContext`. `AppShell` provides `appShellLifecycle`, which clears both deck caches. No shared layer imports a feature any more.
- **CI.** Added a `Webatrice lint` step. Like the Webatrice unit and integration tests, it runs on every non-docs change. The script is `eslint src --max-warnings 0`, because `exhaustive-deps` is a warning and ESLint exits 0 on warnings. `turbo.json` joins the `root` path filter.
- **Shell lifecycle port is required.** `useShellLifecycle` throws when no `ShellLifecycleProvider` is mounted, instead of falling back to a silent no-op. `renderWithProviders` supplies a no-op lifecycle by default (`shellLifecycle: null` omits it).

## Parity rows closed
n/a. This is gate and hygiene work. The Auto Connect fix restores existing behaviour; it does not close a parity row.

## Desktop reference
n/a.

## Testing
All run from the worktree root:
Final tip `a3f242c`, from the repo root:
- `npx turbo run typecheck --concurrency=1`: passes (5/5 tasks).
- `npm run lint`: passes for all three packages, with 0 errors and 0 warnings in Webatrice (now enforced by `--max-warnings 0`; a probe file with a missing dep makes it exit 1).
- `npm test`:
  - Sockatrice: 604 passed.
  - Datatrice: 1083 passed.
  - Webatrice: 1171 passed, 2 skipped (162 files passed, 2 skipped). Both skips were already there before this PR.
- `npm run test:integration`:
  - Sockatrice: 146 passed.
  - Datatrice: 124 passed.
  - Webatrice: 129 passed, 2 skipped. Both skips were already there.
- New specs:
  - `TopBar.spec.tsx` (5 tests): `TopBar` calls the lifecycle port and redirects to the lobby on a mismatched identity, stays quiet for the same identity or a first sign-in, and throws without a provider.
  - `useDeckEditor.spec.tsx` (4 tests): switching to a cached deck re-seeds it and autosaves under its own id with its own content; the previous deck is not mirrored into the next deck's cache entry; an uncached switch clears the deck while it downloads; a pending edit is flushed to the deck it was made on. Three of the four fail without the fix (the uncached-switch case already passed).
  - `appShellLifecycle.spec.ts`: the adapter clears both deck caches.
  - `useSnapGridVisible.spec.ts` and `usePhaseTrackPinned.spec.ts`: default value, restore from storage, and fan-out to subscribers plus persistence.
  - A `LoginForm` regression test: ticking Auto Connect saves it and checks Remember.
- e2e was not run. The behaviour fixes do not need a new server round trip: Auto Connect is a local Dexie write, and the autosave fix only changes which deck id and content an existing upload carries.

## Notes for reviewers
- Commits, in order:
  1. `eslint --fix` across `src` (formatting only; byte-identical esbuild output).
  2. Install the plugin and fix its findings.
  3. Fix max-len.
  4. Move `TopBar` and add the lifecycle port.
  5. CI step and changeset.
  6. Re-seed the deck editor when the deck id changes (review fix).
  7. `--max-warnings 0` on the Webatrice lint (review fix).
  8. Run the Webatrice lint ungated and add `turbo.json` to the root filter (review fix).
  9. Require a `ShellLifecycleProvider` (review fix).
  10. Reword the LoginForm disable reasons (review fix).
- Disable comments that stay, each with a reason:
  - Effects keyed on an identity key (Scryfall fetches, toast registration, known-host selection).
  - LoginForm effects that watch form fields. Each comment now says why: listing the handlers would re-fire them on a host change, and `onUserNameChange` would then invalidate the new host's stored hash.
  - PlayerBox drag and marquee listeners, which re-bind on every drag update.
  - `useReduxEffect`, which takes caller-supplied deps.
  - The arrow-overlay `tick`.
- The lifecycle port has only `onIdentityChanged`. The plan also suggested `onTabClosed`, but closing a tab does no feature work today, so the port leaves it out until something needs it.
- Deferred from Phase 2:
  - TB-02: extract `shellTabs.ts` and `useStickyShellTabs.ts`.
  - TB-03: move route persistence into `services/browser`.
  - `AppShell` still imports `loadPersistedLastRoute`, now through the layout barrel.
- `features/game` still imports from `features/decks` (for example `cardLookup` and `GameBoardCell`). The boundaries config does not check imports within a single element type, so this is plan item DP-01/DP-02 and is not touched here.
- `PlayerBox` still declares the unused `onSetCardCounter` prop in its props type. It was only removed from the destructuring, so callers are untouched.
- The lockfile picks up `@babel/core` and related packages as dependencies of `eslint-plugin-react-hooks` v7, plus some patch bumps under `@babel/*`.
- `webatrice.instructions.md` and the `eslint.boundaries.mjs` comment now list `TopBar` under page chrome and describe the lifecycle port.

## Review response
rv1, PR 01 section:
- **major, deck autosave can write the wrong deck:** fixed in `fix(decks): re-seed the deck editor when the deck id changes`. I re-seeded inside the hook rather than keying the route, so any caller is safe. State is adjusted during render, so no effect runs with the new id and the old deck. `deckRef` now syncs in an effect, so the previous id's unmount flush still serializes its own deck. Regression spec added.
- **major, CI lint can't fail on warnings:** fixed. The script is `eslint src --max-warnings 0`.
- **minor, no `useDeckEditor` spec:** added (4 tests, above).
- **minor, changeset wording:** corrected to describe the cached-deck case and the fix.
- **minor, split e9748c6:** not done. Splitting it means rewriting the middle of a five-commit sequence whose intermediate commits already fail lint by design. The changeset and this description now describe both fixes, and the review fixes are separate commits on top.
- **minor, `ShellLifecycleContext` silent default:** fixed. The hook throws without a provider; the test harness provides a no-op by default.
- **minor, LoginForm disables are fixable with `useCallback`:** not applied. Memoised handlers would still need `selectedHost`, `settings` and `storedHashInvalidated` as deps, so the effects would re-fire on a host switch. `onUserNameChange` would then compare the new host with the old username and invalidate the new host's stored hash. The disables stay, with comments that give the real reason.
- **nit, unused `onSetCardCounter`:** left. Removing the prop also means removing GameBoardCell's optimistic counter builder, which is out of scope for a lint PR.
- **nit, CI gating policy and `turbo.json`:** fixed (Webatrice lint is ungated like its tests; `turbo.json` added to `root`).
- **nit, commit list:** updated.
- **nit, `vi.resetModules` in the two pref-hook specs:** left as is (optional).

