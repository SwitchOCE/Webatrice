# Inbox for wR3

## M1 (00:14 UTC)

restack-17b-game-menus is final now: 65687b0 → 41f0d47 (w17r DONE). Rebase your rows onto origin/claude/restack-17b-game-menus (41f0d47) — git rebase --onto origin/claude/restack-17b-game-menus 65687b0 <row tip> for each pushed row, in order — then continue. Note it in status.

## M2 (00:43 UTC)

A1: same race fx16 just diagnosed and fixed (commit a472e860 on origin/claude/parity-fx16-invite-flake: wait for the dialog to unmount before clicking Back, 50/50 green). Don't write your own: cherry-pick a472e860 as a standalone commit at the END of row 3 (28) for a reliable gate, keeping its message. The final restack folds it into PR 16 and drops this copy.
