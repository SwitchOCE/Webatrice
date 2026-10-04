# Notes for the final linearize (wR4)
- fx16 a472e860 (invite-link wait-for-dialog-close) → fold into PR 16 as a fixup. DROP the duplicate copies: w25b af3cfc1 (claude/parity-25b-board-prefs); wR3's cherry-pick of a472e860 at the end of row 28.
- 27/28 double deletion of GameSelector/OpenGames/SayMessage: wR3 handles it (keep 27's).
- Folds deferred from cloud sessions that can't run rebase -i: listed in wR3.md (26, 27). Any others will be added here.
- f17 adds commits on 17a/17b after R1/wR3 based on 41f0d47 → replay R1, 17c and wR3 rows on f17's 17b.
- R4 vs 25b: HandZone/StackColumn — keep 25b's useSeatClickToPlay → seatCardMetaFromLookup; drop R4's inline lookupCard edits in those two files at replay.
- f25b adds commits on 25b after R2/R6 based on af3cfc1 → replay R2, R6 onto f25b's tip (expect ZoneViewPanel/HandZone/Battlefield conflicts; f25b behaviour wins, R2 structure wins).
- 25a red commits (rv21): squash f70f45a, 734ecf0, de1dd81 into 4cbea4b; move CommittedInput hunk from 8701aae into 4cbea4b; fold f437ae5's e2e tweak into its owning commit.
- T1 (test memory) slots after 32, before R5.
- 17c f17c creates feature-widgets/shortcuts/browserReserved.ts (canonical = 31's d7084c5 content). At 31's replay, drop 31's creation of the file and keep only its deck.new remap + any additions.
