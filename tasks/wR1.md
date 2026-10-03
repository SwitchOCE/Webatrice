# Task wR1 — final restack, part 1 (01 … 23-playmats) into one linear chain

Every PR branch below has been review-fixed on its ORIGINAL parent. Make them one linear chain, in this merge order, each branch rebased onto the NEW tip of the one before it. Push each result to `claude/restack-<NN-name>` (e.g. `claude/restack-03-protocol`). Status after each branch: `- <NN> <old-base>..<tip> → new tip <sha>, typecheck ok`.

| # | branch (`origin/parity/…`) | its commits are `<old-base>..<branch>` | rebase onto |
|---|---|---|---|
| 1 | 01-lint | `origin/master..` | — (unchanged; push as-is) |
| 2 | 02-hand-reorder | a3f242c.. (already on fixed 01) | unchanged |
| 3 | 03-protocol | a5fbad4.. | new 02 |
| 4 | 12-moderation-users | f24ddd9.. | new 03 |
| 5 | 04-command-outcomes | 54287c0.. | new 12 |
| 6 | 10-account-auth | 58b4116.. | new 04 |
| 7 | 11-rooms-chat-users | 4119363.. | new 10 |
| 8 | 13-administration | a6642c3.. | new 11 |
| 9 | 06-e2e-hardening | e2fb4b7.. | new 13 |
| 10 | 15-replays | d2e3d1e.. | new 06 |
| 11 | 14-reports | 0d1d235.. | new 15 |
| 12 | 19-settings | a6642c3.. | new 14 |
| 13 | 21-appearance-i18n-diag | e3a1137.. | new 19 |
| 14 | 20-card-data | 4156694.. | new 21 |
| 15 | 24-platform-gates | d2e3d1e.. | new 20 |
| 16 | 23-playmats | 8fca043.. | new 24 |

Use `git rebase --onto <new-prev> <old-base> <branch>` per row (verify each `<old-base>` is an ancestor of the branch and that the range holds only that PR's commits — compare with the PR file's commit list). 15 is final at `origin/parity/15-replays` (50214e1; its commits are `d2e3d1e..50214e1`). 14 is still being fixed by worker f14 on `origin/claude/parity-14-reports` (base 0d1d235 = OLD 15). Before row 11: `git fetch origin` and read `origin/claude/notes-f14:status.md`; when its last line says DONE, use `origin/claude/parity-14-reports` with old-base 0d1d235 (and rebase onto your new 15). If not DONE yet, check every 5 minutes for up to 60 minutes; meanwhile you may restack rows 12–16 temporarily onto your new 15 and redo them after 14 lands, or just wait. I'll also post to your inbox when f14 is done.

Conflict rules (read the PR files of both sides first):
- Keep both behaviours. A lower PR's review fix wins over an upper PR's older copy of the same code.
- **Failure pattern (series decision):** 03 now owns the scope-level `commandFailed` mechanism + Datatrice `*CommandFailed` signals; 13 also added one — keep ONE implementation (03's names/signature), make 13/14 use it, and keep the instructions text consistent (03 introduces, 13 extends).
- Grid/keyboard rows: 11, 13, 15, 20 each added a roving-tabIndex/grid helper. Converge on ONE shared hook (15's `useGridRows` in `@app/hooks` if suitable) at the first branch that needs it; later branches use it. Note in each affected PR file.
- Dexie: 15 = v5, 19 = v6, 20 = v7 — monotonic in this order; keep.
- e2e specs import `test` from the hermetic fixture (06 onward).
- Shared hubs (barrels, routes, IWebClientResponse, userMenuEntries): additive, one per line.
- `src/i18n-default.json` is generated: on conflict, take either side then run `npm run translate -w @cockatrice/webatrice` and commit the regenerated file.

Every commit must typecheck: after each branch, `git rebase -x "npx turbo run typecheck --concurrency=1 --filter=...[HEAD^]"` or at minimum typecheck each branch tip plus spot-check commits where conflicts were resolved. Run the full gate (incl. webatrice e2e, all browsers) at the final tip (23-playmats) and the unit+integration gate at the tips of 13, 06, 14 and 20.

Deliverables: all 16 `claude/restack-*` branches pushed; status lists old→new tip per branch; final message with gate results and every non-trivial conflict resolution (branch, file, what you kept).
