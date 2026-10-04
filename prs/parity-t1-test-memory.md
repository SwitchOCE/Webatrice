# test: keep the webatrice unit suite under 3 GB in one run (Vitest 5, vmForks, order-dependent specs)

## Summary
The webatrice unit suite (468 files, 3,789 tests) could no longer run as one `vitest run --maxWorkers=2`: RSS climbed to 13.3 GB and the run was OOM-killed after ~400 s. After this branch the whole suite runs in one `npm test` with a **2.6 GB peak in 225 s**, faster than today's split run. Every spec file now passes alone, in shuffled order, and on a single worker.

Root causes, in the order they were found:

1. **Vitest 4 never frees a mock (the main leak).** `@vitest/spy` 4.x keeps every mock in a module-level `REGISTERED_MOCKS` Set and never deletes from it. In a VM pool that module lives as long as the worker, so every `vi.fn()` from every file stays reachable, with its implementation, its recorded calls and the module graph they close over. A heap-snapshot diff from file 5 to file 40 of the game specs counted **23,617 retained mocks**. After a forced GC each worker still grew ~12 MB per file. No Vitest 4 API reaches the Set: a file-level `afterAll(() => vi.resetAllMocks())` left the post-GC heap identical to the MB (measured on 8 game specs: 172 → 819 MB either way). Vitest 5 holds the registry as `WeakRef`s with a `FinalizationRegistry`. On the same files the post-GC heap now stays flat at ~180–210 MB per worker.
2. **Garbage without a heap cap.** On Vitest 5 nothing is retained, but RSS still reached 7.9 GB: V8 sizes a worker's heap from total RAM and defers collection. The pool moves from `vmThreads` to `vmForks` with `execArgv: ['--max-old-space-size=1024']`. Node refuses V8 flags in a worker thread, and a child process accepts them.
3. **The MUI package root in two components.** `LanguageDropdown` and `CountryDropdown` imported from `@mui/material`, which evaluates all of MUI, and both sit under the `@app/components` barrel. On a 60-file sample this was 11% of wall time (74 → 65 s). They now import by path, like the rest of the code base, and `no-restricted-imports` rejects root value imports.
4. **Order-dependent specs** (see Testing). Seven Dexie DTO specs asserted on an import-time call that the global `afterEach` had already cleared. GameReplay's live-board control left card lookups running past the end of the file.

## Parity rows closed
None: test infrastructure only.

## Desktop reference
Not applicable (no protocol or UI behaviour change). The MUI import change renders the same components.

## Testing
Peak RSS is for the whole process tree, sampled every 0.5 s. Same 4-vCPU / 15.6 GB container throughout.

| webatrice unit suite | peak RSS | wall | result |
|---|---|---|---|
| base `87a20ef`, vmThreads, one run, w=2 | 13.3 GB, **OOM-killed** | 380–408 s until killed | — |
| base, `--shard=1/2` + `--shard=2/2`, w=2 (today's workaround) | 7.5 GB / 7.7 GB | 145 + 154 = **298 s** | 3,789 pass |
| base, `--pool=forks`, w=2 | 1.4 GB | 668 s | 3,789 pass |
| base, `--pool=threads`, w=2 | 1.2 GB | 659 s | 3,789 pass |
| Vitest 5, vmThreads, w=2 (no cap) | 7.9 GB | 227 s | 3,789 pass, 5 unhandled rejections (GameReplay, fixed here) |
| **tip `0fb5a3f`, `npm test -- --maxWorkers=2`** | **2.6 GB** | **225 s** | **468 files, 3,789 pass** |

Gate on the tip (`npx turbo run typecheck --concurrency=1`, `npm run lint`, `npm test -- -- --maxWorkers=2`, `npm run test:integration -- -- --maxWorkers=2`), with each package's suite run as one command:
- typecheck 5/5 tasks, lint 3/3 tasks: clean.
- unit: sockatrice 43 files / 896 tests, datatrice 35 / 1,316, webatrice 468 / 3,789: all pass.
- integration: sockatrice 20 / 175, datatrice 10 / 145, webatrice 52 / 270: all pass.
- Order independence, webatrice: `--sequence.shuffle` seeds 1, 2 (threads, before the fixes: only the DTO specs failed) and seed 7 (final config): 3,789 pass. `--maxWorkers=1` on the final config: 3,789 pass in 464 s.
- e2e (`npm run test:e2e -w @cockatrice/webatrice`, Servatrice 3.0.0; run because two components and `boot.tsx` changed their MUI import paths): the production build passes. Chromium + Firefox: **60 passed, 10 skipped, 0 failed** (10.0 min). All 32 WebKit tests failed in 3–5 ms at `browserType.launch` ("Host system is missing dependencies to run browsers"), a container limitation, not a test result. WebKit was not re-run.

**Order-dependent and leaking specs, and their causes:**
- `services/dexie/DexieDTOs/{Card,Format,Host,Info,Set,Setting,Token}DTO.spec.ts` (7 files): the "registers itself with the table on import" test asserted `mapToClass` was called. That call happens once, at load, and the global `afterEach(vi.clearAllMocks)` clears it, so the test only passed when it ran first (shuffle failed 6 of 7; HostDTO happened to run first). The specs now copy `mock.calls` at module load.
- `features/game/replay/GameReplay.spec.tsx`: the live-board control double-clicks every element, including hand cards. Each double-click awaits the real card catalog, which settled after the file ended and dispatched into a torn-down store. It now uses the seat specs' `unknownCardCatalog` and flushes in `act`.
- The **cross-file failures under single-worker `vmThreads` on Vitest 4** (63 tests in the 30-file `features/game/components/ui` subset; 30 once Testing Library's cleanup was forced) were not dependencies in the specs. Each of those files passes alone and under `threads`/`forks` isolation in any order. Two Vitest 4 VM-pool defects caused them:
  - (a) Testing Library's import-time `afterEach(cleanup)` bound only to the first file on a worker, because `node_modules` are shared. Later files never unmounted, e.g. `hooks/useGridRows.spec.tsx` after `useSettings.spec.ts`, `usePlaymatSettings.spec.ts` or `useDialogFocus.spec.tsx`.
  - (b) a `vi.mock` of a source module did not take effect once an earlier file on the worker had evaluated the real module: `GameBoardCell.spec.tsx` (26 tests) after `HandZone`/`PlayerBoard*` specs, plus `HandZone`, `SeatDragGhostCards` and `StackColumn` in the same subset.

  On Vitest 5 + vmForks the same pairs and the same 60-file sample pass at `--maxWorkers=1`, and so does the full single-worker run above.

## Notes for reviewers
- **Why a major upgrade in a memory PR.** Vitest 4 offers no fix (point 1). The upgrade is its own commit (`7bc7b7a`): all three packages, with `@vitest/coverage-v8` in lockstep, and no config changes. It can be reverted on its own. Of the v5 migration notes, `clearMocks` now defaults to true, which webatrice's setup already did after each test. No spec nests a hoisted `vi.mock`, leaves an async assertion unawaited, uses `toThrow('')` or the worker ids, and the coverage globs are explicit. The one fallout was Sockatrice's declaration build: `makeMockWebSocketInstance` / `installMockWebSocketHarness` inferred a type naming Vitest's internal `Procedure`. They now declare `UnitMockWebSocket` / `UnitMockWebSocketHarness` (the `setup.ts` name `MockWebSocketInstance` was taken). Changeset: `sockatrice-testing-mock-websocket-types.md` (patch). Datatrice and webatrice only change devDependencies, so they get no changeset.
- **Why a VM pool, and not threads/forks.** Both isolated pools stay near 1.3 GB but take 2.2× as long (659–668 s): each file reloads jsdom (~635 CommonJS modules) and every dependency. `deps.optimizer.client` saved only ~10% and broke `importOriginal` partial mocks of `react-router-dom`. A VM pool keeps a fresh source-module graph per file, so `isolate: true` still holds for app code. The testing instructions now spell out what is shared per worker: `node_modules`, so no async work may outlive a spec, and no assertion on an import-time call after the first test.
- **The 1 GB cap is the memory guard.** A worker whose live heap really exceeds 1 GB now fails with a V8 out-of-memory error instead of growing until the CI runner kills the job, so no separate RSS-budget script was added. The integration config spreads the unit config, so it clears `execArgv` for its `threads` pool (`0fb5a3f`).
- **Not done / follow-ups.** `@app/components` (~1.7 s) and `@app/features/game` (~2 s) are still the most expensive imports per file. Narrower barrels would speed both pools but are a product-structure change outside this scope. Vitest's VM pools are marked experimental upstream. If a future Vitest regresses them, `threads` is the documented fallback (correct, at 2.2× the time).
