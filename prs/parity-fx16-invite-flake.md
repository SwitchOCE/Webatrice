# test(game): wait for the link dialog to close before clicking Back (fixup for PR 16)

## Summary
`invite-link.spec.tsx` › "a link clicked in a room's chat opens the game with one navigation (Back returns to
the room)" failed at line 174 with `Unable to find an accessible element with the role "button" and name "back"`.

Root cause (test bug, not a product race): the GameLink confirm dialog closes on "Yes", but MUI keeps every
sibling of a modal `aria-hidden` until the dialog's exit transition ends (real timers). The failure DOM shows
exactly that: the closing confirm dialog (empty message, since `flow.step` had already left `confirm`) and the
probe/Back container marked `aria-hidden="true"`. Whenever the join resolved and the location reached `/game/77`
inside the transition window, `getByRole('button', { name: 'back' })` found nothing. The join command, the single
navigation and the return to `/room/1` were correct in every failing run.

Fix: before clicking Back, wait for the dialog to unmount, using the same idiom and comment as
`integration/src/features/moderation.spec.tsx:246`. No retries and no longer timeouts.

## Parity rows closed
None (test stability for GAME-033).

## Desktop reference
N/A. Test-only change.

## Testing
- Reproduced on d2e516c by running the spec alone 30×: **15/30 failed** (50%; fr4 saw about 1 in 5 in the full suite).
- After the fix, the spec alone ran **50/50 green** in a row (5/5 tests each).
- typecheck ✅ · lint ✅
- Unit: sockatrice 895, datatrice 1312, webatrice 3427, all passed.
- Integration ×3, all green each time: sockatrice 175, datatrice 144, webatrice 265 (49 files).

## Notes for reviewers
- w25b fixed the same race on its own (`af3cfc1` on `claude/parity-25b-board-prefs`) with
  `fireEvent.click(await screen.findByRole('button', { name: 'back' }))`. The diagnosis is the same. **Kept this
  version (fx16):** it waits on the cause itself (the dialog unmounting), it matches the existing
  moderation.spec precedent, and if the dialog ever fails to close, the failure points at the dialog rather than
  at a missing Back button. The restack should drop w25b's copy.
- No deterministic product spec was added because no product race exists.
