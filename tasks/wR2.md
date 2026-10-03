# Task wR2: final restack, part 2 (refactor line onto the restacked chain)

Continue the linear chain that wR1 built. Its tip is `origin/claude/restack-23-playmats`. Rebase each row onto the NEW tip of the row before it, then push to `claude/restack-<NN-name>`. Use the same rules as `/tmp/notes/tasks/wR1.md`: a lower PR's review fix wins, keep both behaviours, regenerate `i18n-default.json`, every commit typechecks, and status after each row.

| # | branch (`origin/parity/…`) | commits = `<old-base>..<branch>` | onto |
|---|---|---|---|
| 17 | 05-refactor-seat | `d2e3d1e..` (d2e3d1e = old 06) | `origin/claude/restack-23-playmats` |
| 18 | 09-refactor-decks | `dc77ebd..` (dc77ebd = 05's stage-1 changeset commit "chore(changeset): note the game seat refactor"; it is in the old 05, so this range is exactly 09's own commits) | new 05 TIP |
| 19 | 18-decks | `a3073b8..` | new 09 |
| 20 | 23d-deck-share | `a7b9684..` (old 18) | new 18 |
| 21 | 16-game-lobby | `dc77ebd..` | new 23d |

17a and 17b are NOT in this task. Another worker ports them onto your result, because they were built before refactor stage 5 removed PlayerBox.

Expected conflicts:
- **05 over the chain.** Line A's review fixes touched code that 05 moved or deleted, most importantly 02's hand-reorder fixes (pile-view drop target; multi-card reorder order) and 04/12/13's game-menu and moderation changes. Port each lower fix into the region/hook that now owns the code, and keep the specs that pin it. List every port in status.
- **05 now sits on 19 (settings) and 21 (appearance).** Use 19's `usePreference` instead of any localStorage fallback that 05 introduced. Use 21's theme tokens in new region components, not hard-coded colours.
- **16 vs stage 5.** Stage 5 deleted the in-game SideboardDialog, because 16 hosts sideboarding in the lobby. Keep it deleted.
- **23d over 18.** f0918 changed 18's API: `deckUpdate(deckId, deckList, isPublic?, colorIdentity?)`, `createDeck`/`importDeck` return boolean, `DeckDialogFrame` requires `titleId`. Adapt 23d.

Gate:
- the full gate at the 21 tip, including webatrice e2e on all browsers, plus sockatrice e2e;
- unit and integration at the 05 and 18 tips;
- per-commit typecheck throughout.

Final message: the tips and every non-trivial port or resolution.
