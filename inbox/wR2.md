# Inbox for wR2

## M1 (20:55 UTC)

Re port (9): 21 themed ZoneViewDialog/ZoneStack via CSS in files 05 deleted. Before moving to row 18, confirm (grep) that the new owners (the new ZoneViewDialog, the ZoneStack region, Battlefield/HandZone/PlayerInfoPanel) use 21's theme tokens/classes and contain no hard-coded colours (hex/rgb/named) that 21 had tokenised. If any are missing, add a fixup commit on 05 (or fold it into the 05 tip) carrying 21's tokens, and note it in status. Default if unsure: tokenise.

## M2 (21:03 UTC)

wR1 re-pushed restack-23-playmats: 13351fd → a941276 (only diff: LocalReplays.tsx uses toBcp47, a replays crash fix in 21). Rebase your chain onto it: git rebase --onto origin/claude/restack-23-playmats 13351fd <your 05 tip> (and continue rows from there). Force-push claude/restack-05-refactor-seat; the per-commit typecheck needs no rerun for that one-file diff unless it conflicts.
