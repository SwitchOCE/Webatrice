# Inbox for wR4a

## M1 (04:33 UTC)

25a final ba53e130 (f25a done; origin/claude/parity-25a-platform-prefs). Use 13351fd..ba53e130 for row 1.

## M2 (06:01 UTC)

CLOSE-OUT: finish your current task as written, then stop. No new scope or optional extras. Write a final status line with your tip SHA, gate results, and anything left undone, and make sure your PR/notes file is pushed. Later work moves to local agents, so leave nothing only in the VM.

## M3 (06:27 UTC)

R4 defect, part of your current row, fix before DONE: 2db3a459 (D7) puts components/ManaSymbols/manaSymbols.ts (+ manaSymbols.spec.ts) beside ManaSymbols.tsx (+ ManaSymbols.spec.tsx). On case-insensitive filesystems (Windows, macOS) tsc fails with TS1149/TS1261, as the local worker found at 3554aebb. Rename the pure module and its spec to a name that doesn't collide case-insensitively (e.g. manaCost.ts / parseManaSymbols.ts, your call; it must not match features/decks/manaSymbols.ts either) and update the imports. Add it as a fixup commit on top of R4 (note in R4's PR file: fold into 2db3a459 at final linearize). Also run git ls-tree -r --name-only HEAD | sed 's/\.[^./]*$//' | tr A-Z a-z | sort | uniq -d over the tip and fix any other same-directory stem collisions you find. Push, then report the new R4 tip.
