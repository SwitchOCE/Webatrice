# Task wR3 — restack the platform a11y/i18n/prefs PRs onto the game chain

Push branches: `claude/restack-<NN-name>` per row. Rules as `/tmp/notes/tasks/wR1.md` (lower fix wins, keep both behaviours, regenerate `i18n-default.json`, per-commit typecheck, status after each row).

These four PRs were built on `restack-23-playmats` in parallel and now move above the refactor/game line:

| # | branch | commits = `<old-base>..<branch>` | onto |
|---|---|---|---|
| 1 | `origin/claude/parity-25a-platform-prefs` | `13351fd..` (13351fd = old restack-23 tip; new one is a941276) | `origin/claude/restack-17b-game-menus` |
| 2 | `origin/claude/parity-26-a11y-primitives` | `13351fd..` (13351fd = old restack-23 tip; new one is a941276) | new 25a |
| 3 | `origin/claude/parity-27-a11y-keyboard-paths` | `13351fd..` (13351fd = old restack-23 tip; new one is a941276) | new 26 |
| 4 | `origin/claude/parity-28-i18n-gate` | `13351fd..` (13351fd = old restack-23 tip; new one is a941276) | new 27 |

Expected conflicts: 26/27/28 all touch TopBar and chat. 25a's mention completer vs 26's `role=log` chat. 28's string extraction vs anything 05/09/18/23d/16/17a/17b added in platform folders: extract those strings too, so PR 28's lint rule passes on every folder not in the off-list. 27 vs 26: if 27 left `TODO(PR26)` stubs, swap them onto 26's primitives now. 25a may have left `TODO(PR26)` for its completer listbox: swap that too.

Gate at the 28 tip: the full gate plus webatrice e2e on all browsers.

**Squash carried from rv11/f27:** in row 3 (27), fold the commit that updates `integration/src/features/rooms-components.spec.tsx` (old 94a1ecb, "integration spec imported deleted comps") into the commit that deletes GameSelector/OpenGames/SayMessage (old baf3b91), so the integration suite imports at every commit. Do it while replaying the row: cherry-pick in order, then use `git commit --amend` or `git reset --soft` plus re-commit. No interactive rebase, since the session classifier blocks `rebase -i`. Check with typecheck plus the integration import at each commit of the row.

**Duplicate deletion (27 and 28):** both PRs delete GameSelector, OpenGames and SayMessage plus their specs. Keep the deletion in 27, as the squashed commit above. When replaying 28, its deletion becomes a no-op: drop those hunks, and make sure 28 doesn't re-add anything.

**Coverage port (with 27's deletion commit, or a test commit right after it):** the deleted `GameSelector.spec`/`OpenGames.spec` asserted behaviour that the live `GamesList` + `useJoinGame` still own. `useJoinGame.spec` already covers password, full-game spectate, already-open routing and join errors. Port the rest into `GamesList.spec` against the live component, wherever the behaviour exists there:
- Join is disabled until a game is selected, while `joinGamePending`, and when the game is full.
- Spectate is disabled when spectators are not allowed.
- Judge buttons show only with the IsJudge flag.
- The filter dialog applies and cancels correctly, and Clear filter dispatches `clearGameFilters`.
- Create submits `createGame`.

List the ported tests in 27's PR file.
