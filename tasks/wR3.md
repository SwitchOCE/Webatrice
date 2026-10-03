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
