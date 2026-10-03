# Task wR3 — restack the platform a11y/i18n/prefs PRs onto the game chain

Push branches: `claude/restack-<NN-name>` per row. Rules as `/tmp/notes/tasks/wR1.md` (lower fix wins, keep both behaviours, regenerate `i18n-default.json`, per-commit typecheck, status after each row).

These four PRs were built on `restack-23-playmats` in parallel and now move above the refactor/game line:

| # | branch | commits = `<old-base>..<branch>` | onto |
|---|---|---|---|
| 1 | `origin/claude/parity-26-a11y-primitives` | `13351fd..` (13351fd = old restack-23 tip; new one is a941276) | `origin/claude/restack-17b-game-menus` |
| 2 | `origin/claude/parity-27-a11y-keyboard-paths` | `13351fd..` | new 26 |
| 3 | `origin/claude/parity-28-i18n-gate` | `13351fd..` | new 27 |
| 4 | `origin/claude/parity-25a-platform-prefs` | `13351fd..` | new 28. Do it **only after the orchestrator mailboxes "25a ready"**. If that hasn't arrived when rows 1–3 are gated, finish without it and say so in status. |

**Row order changed:** 25a is last so that 26–28 don't wait for it. Wherever the notes below refer to rows by number, use this mapping: 26 = row 1, 27 = row 2, 28 = row 3, 25a = row 4.

If `restack-17b-game-menus` is force-pushed while you work (w17r is still gating it), rebase your rows onto the new tip and note it in status.

Expected conflicts: 26/27/28 all touch TopBar and chat. 25a's mention completer vs 26's `role=log` chat. 28's string extraction vs anything 05/09/18/23d/16/17a/17b added in platform folders: extract those strings too, so PR 28's lint rule passes on every folder not in the off-list. 27 vs 26: if 27 left `TODO(PR26)` stubs, swap them onto 26's primitives now. 25a may have left `TODO(PR26)` for its completer listbox: swap that too.

Gate at the 28 tip: the full gate plus webatrice e2e on all browsers.

**Squash carried from rv11/f27:** in row 2 (27), fold the commit that updates `integration/src/features/rooms-components.spec.tsx` (old 94a1ecb, "integration spec imported deleted comps") into the commit that deletes GameSelector/OpenGames/SayMessage (old baf3b91), so the integration suite imports at every commit. Do it while replaying the row: cherry-pick in order, then use `git commit --amend` or `git reset --soft` plus re-commit. No interactive rebase, since the session classifier blocks `rebase -i`. Check with typecheck plus the integration import at each commit of the row.

**Duplicate deletion (27 and 28):** both PRs delete GameSelector, OpenGames and SayMessage plus their specs. Keep the deletion in 27, as the squashed commit above. When replaying 28, its deletion becomes a no-op: drop those hunks, and make sure 28 doesn't re-add anything.

**Coverage port (with 27's deletion commit, or a test commit right after it):** the deleted `GameSelector.spec`/`OpenGames.spec` asserted behaviour that the live `GamesList` + `useJoinGame` still own. `useJoinGame.spec` already covers password, full-game spectate, already-open routing and join errors. Port the rest into `GamesList.spec` against the live component, wherever the behaviour exists there:
- Join is disabled until a game is selected, while `joinGamePending`, and when the game is full.
- Spectate is disabled when spectators are not allowed.
- Judge buttons show only with the IsJudge flag.
- The filter dialog applies and cancels correctly, and Clear filter dispatches `clearGameFilters`.
- Create submits `createGame`.

List the ported tests in 27's PR file.

**Folds carried from rv13/f26 (row 1, PR 26):**
- Fold `0a0ab4d`'s `integration/src/features/player.spec.tsx` change into `f6ac60e`.
- Fold `542cf5d`'s `e2e/specs/browser-support.spec.ts` fix into `f6ac60e`.
- Split `36cd584` into `fix(a11y): hand the opener across swapped dialogs` (the hook + unit spec) and `test(a11y): …` (the e2e).

The SHAs are pre-restack. Match by message, and use cherry-pick plus amend or `reset --soft`, never `rebase -i`. Every commit of the row must typecheck, and the integration suite must pass at f6ac60e's replacement.

**document.title after 28:** at the 28 tip, check that `document.title` uses the translated tab titles (28 derives them at render time from keys). Add a spec if neither 26 nor 28 has one.

**Folds carried from rv14 (row 1, PR 26):** fold `08393d9`'s ToastContext hunk into `5e81593`, and its `i18n-default.json` hunk into `ef177d5` (pre-restack SHAs; match by message). Every commit of row 1 must be lint-green and i18n-consistent.
