# Inbox for wR1

## M1 (17:34 UTC)

M1 (correction, act before row 8): you wrote '11: joinRoom: 11's surface wins, 04's userInitiated plumbing dropped'. That loses PR 04's REVIEW FIX (rv2: JOIN_ROOM_FAILED dialogs only for user-initiated joins, autojoin silent like desktop setCurrent=false, queued notices cleared on disconnect). Rule: a lower PR's review fix wins. Redo row 7 (11) so 11's joinRoom surface CARRIES 04's userInitiated flag through to the failure notice (adapt 11's API to accept/pass it), keep 04's specs for it green, and re-push claude/restack-11-rooms-chat-users; then continue from row 8 on the corrected 11. Also check rows 1–6 for any other review-fix drops and list them in status. M2: f14 is DONE — 14 is final at origin/claude/parity-14-reports 60b3669 (old-base 0d1d235); use it for row 11.
