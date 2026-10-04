# Task vr6: verify and finish fr6 (PR R6)
fr6 applied every rv18 finding as 3 commits on `origin/claude/parity-r6-game-listeners` (tip 115f1e9), but its session couldn't run `npm ci`, so **nothing was run**. Your job: check out that branch, `npm ci`, and run:
- the full gate (typecheck, lint, unit, integration);
- every mutation probe listed in /tmp/notes/reviews/rv18.md (remove STACK/GRAVE/EXILE from `POSITIONAL_REORDER_ZONES` one at a time; force `faceDown: false` in the optimistic patch; swap undo-draw name precedence; write 0/0 attach ids). Each must now be killed by a spec.

Fix anything red or any surviving mutant as new commits on top (no history rewrite), push to the same branch, and update the PR file's Testing section with real counts and the mutant table. Webatrice e2e is only needed if UI-facing code changed.

If `npm ci` is refused by the session policy, retry once after 2 minutes. If it's still refused, raise a QUESTION and wait.
