# Task wR4a: intermediate linearize (join the 25b/R-line onto the game chain)
Push branches: `claude/restack-<NN-name>` per row. Rules as `/tmp/notes/tasks/wR1.md`: a lower fix wins, keep both behaviours, regenerate `i18n-default.json`, every commit typechecks, status after each row. Use plain `git rebase --onto` or cherry-pick (no `rebase -i`: the session classifier blocks it). Also read `/tmp/notes/restack-final-notes.md` and apply every rule that concerns these rows.

Base: `origin/claude/restack-28-i18n-gate` (bcced39 = 01…23p | 05 09 18 23d 16 17a 17b | 26 27 28). **Exception:** f17 added commits to 17a/17b after 26–28 were stacked, so first replay 26–28 onto f17's 17b and use that as the base:
- `git rebase --onto origin/claude/restack-17b-game-menus 41f0d47 bcced39`, then push `restack-26`/`27`/`28` again.
- Also fold fx16 (`a472e860`, `origin/claude/parity-fx16-invite-flake`) into PR 16 as its last commit, and replay everything above 16. Drop the duplicate copies (w25b `af3cfc1`, and the copy of a472e860 at the end of 28).

| # | PR | commits | onto |
|---|---|---|---|
| 1 | 25a | `13351fd..origin/claude/parity-25a-platform-prefs` | new 28 |
| 2 | R1 | `41f0d47..origin/claude/parity-r1-card-ops-seam` | new 25a |
| 3 | 25b | `d2e516c..origin/claude/parity-25b-board-prefs` (minus `af3cfc1`) | new R1 |
| 4 | R2 | `origin/claude/parity-25b-board-prefs..origin/claude/parity-r2-zone-view-family` (fr2 rebased R2 onto f25b's 25b) | new 25b |
| 5 | R6 | `af3cfc1..origin/claude/parity-r6-game-listeners` | new R2 |
| 6 | R4 | `d2e516c..origin/claude/parity-r4-scryfall-catalog` | new R6 |

Expected conflicts and how to resolve them:
- **R1 vs f17:** both touch play paths; R1's single play helper wins.
- **R2 vs f25b:** ZoneViewPanel / cardViewHeight / expand. R2's structure wins, f25b's behaviour wins.
- **R4 vs 25b:** keep 25b's `useSeatClickToPlay` and drop R4's inline `lookupCard` in HandZone/StackColumn.
- **R4 vs 28/26:** string extraction, Menu.
- **R6 vs 25b:** the time base in game listeners. f25b's datatrice time-base fix must survive the split.

Gate at the R4 tip: the full gate plus webatrice e2e on all browsers; per-commit typecheck for every row. Write `prs/restack-part4.md` and add restack notes to each PR file.

**25a timing:** f25a is still finishing review fixes on `origin/claude/parity-25a-platform-prefs`. Do the 17b/26–28 re-replay and the fx16 fold first. When you reach row 1, take whatever 25a tip exists then, but the orchestrator will mailbox "25a final <sha>". If that message arrives after you've replayed 25a, replay the extra commits on top of row 1 and rebase the rows above.
