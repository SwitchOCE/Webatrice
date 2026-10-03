# fix(webatrice): make the lint gate green and enforce it in CI

## Summary
- **Hooks lint is real now.** The source had `react-hooks/exhaustive-deps` disable comments, but the plugin was never installed, so ESLint reported each one as an unknown rule and checked no hooks. This PR installs `eslint-plugin-react-hooks@^7.1.1` and turns on only `rules-of-hooks` (error) and `exhaustive-deps` (warn). The React Compiler rule set stays off. There were no rules-of-hooks errors. Every exhaustive-deps finding was reviewed: each one is either fixed, or kept as a disable comment with a one-line reason.
- **Two real bugs fixed along the way.**
  - `LoginForm` had stopped wiring the Auto Connect checkbox to `onUserToggleAutoConnect`, which the code marks `@critical` as the only path that saves the preference. Ticking the box never saved it. It is wired again, with a regression spec.
  - In `useDeckEditor`, `scheduleSave` kept the `persistNow` from the first render. After the editor moved from one deck to another without unmounting, autosave could upload under the old deck id. `scheduleSave` now depends on `persistNow`.
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
- **CI.** Added a `webatriceGate` output, set when Webatrice, either library, the protocol or root config changes. Added a `Webatrice lint` step gated on it, matching the Sockatrice and Datatrice steps.

## Parity rows closed
n/a. This is gate and hygiene work. The Auto Connect fix restores existing behaviour; it does not close a parity row.

## Desktop reference
n/a.

## Testing
All run from the worktree root:
- `npm run typecheck`: passes (exit 0).
- `npm run lint`: passes for all three packages, with 0 errors and 0 warnings in Webatrice.
- `npm test`:
  - Sockatrice: 604 passed.
  - Datatrice: 1083 passed.
  - Webatrice: 1166 passed, 2 skipped. Both skips were already there before this PR.
- `npm run test:integration`:
  - Sockatrice: 146 passed.
  - Datatrice: 124 passed.
  - Webatrice: 129 passed, 2 skipped. Both skips were already there.
- New specs:
  - `TopBar.spec.tsx` (4 tests): `TopBar` calls the lifecycle port and redirects to the lobby on a mismatched identity, and stays quiet for the same identity or a first sign-in.
  - `appShellLifecycle.spec.ts`: the adapter clears both deck caches.
  - `useSnapGridVisible.spec.ts` and `usePhaseTrackPinned.spec.ts`: default value, restore from storage, and fan-out to subscribers plus persistence.
  - A `LoginForm` regression test: ticking Auto Connect saves it and checks Remember.
- e2e was not run. The two behaviour fixes do not need a new server round trip: Auto Connect is a local Dexie write, and the autosave fix only changes which deck id an existing upload targets.

## Notes for reviewers
- Commits, in order:
  1. Install the plugin and fix its findings.
  2. Fix max-len.
  3. Move `TopBar` and add the lifecycle port.
  4. CI step and changeset.
- Disable comments that stay, each with a reason:
  - Effects keyed on an identity key (Scryfall fetches, toast registration, known-host selection).
  - LoginForm effects that watch form fields.
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
