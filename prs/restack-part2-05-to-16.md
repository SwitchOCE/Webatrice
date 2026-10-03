# Final restack, part 2: the refactor line (05, 09, 18, 23d, 16) onto the restacked chain

## Summary

Continues part 1's linear chain from `claude/restack-23-playmats` (a941276). Each branch was replayed with `git rebase --onto <new previous tip> <old base>`, so each still carries exactly its own commits, and pushed as `claude/restack-<NN-name>`:

| # | branch | commits | new tip |
|---|---|---|---|
| 17 | 05-refactor-seat | 86 | `b5759d0` |
| 18 | 09-refactor-decks | 16 | `dc3a9aa` |
| 19 | 18-decks | 24 | `12717e4` |
| 20 | 23d-deck-share | 17 | `a28e53e` |
| 21 | 16-game-lobby | 16 | `d2e516c` |

Lower review fixes were ported into the owners the refactor created; fixes to this line's own commits were folded into the commit that introduced the code (autosquash), so no commit is red. Main decisions:

- **#02 hand reorder** lives in `seatDropPlan` (hand target carries the strip order → `planHandReorder`, one command per card) and the hand-viewer no-op lives in `ZoneViewDialog`.
- **#19/#23/#20/#15** features moved into the regions: `playToStack` (HandZone), `tapAnimation` and the playmat (Battlefield), `closeEmptyCardView` (ZoneViewDialog, per view), by-name deck image prefetch (useSeatCardMetadata), replay `readOnly` board (Game).
- **Layering:** the card catalog moved to `services` cannot import `hooks`, so the card-data preferences snapshot moved to `services/cardDatabase`.
- **Failure pattern:** #23d's `deckSharingFailed` folded into #03's `session.commandFailed` (+ transport failure, `SessionCommandFailedPayload`); #16's `deckSelectFailed` stays as a #04-style per-command signal.
- **#20 deck switch** re-seed carried through #09's hook split and #18's save signatures; #18's `saveTextFile` delegates to `downloadBlob`.
- **#21 tokens** applied to the new UI of 09/18/23d/16; 05's new owners already use token classes.
- **#11 one-list join errors** → #16's link host reports its own rejection on every page.
- In-game `SideboardDialog` stays deleted.

Per-PR details are in each PR file's `## Restack notes (wR2)`.

## Parity rows closed

None directly (mechanical restack); see the five PR files.

## Desktop reference

Only where a resolution picked behaviour: `view_zone_widget.cpp`/`ViewZoneLogic` (close an emptied view, shuffle on close), `PlayerActions::playCard` (play to stack), `server_abstract_player.cpp:417-428` (multi-card hand moves), `GameSelector::checkResponse` (one join-error surface).

## Testing

- Per-commit typecheck: 05 86/86, 09+18+23d+16 73/73 (16 re-checked 16/16 after its last fixup).
- 05 tip: lint ok; unit sock 880 / data 1281 / web 2748; integration sock 171 / data 140 / web 212.
- 18 tip: lint ok; unit sock 887 / data 1289 / web 3227; integration sock 171 / data 140 / web 248.
- 16 tip (`d2e516c`), full gate: typecheck + lint ok (0 warnings); unit sock 895 / data 1312 / web 3427; integration sock 175 / data 144 / web 265; sockatrice e2e 5/5; webatrice e2e chromium + firefox + webkit 66 passed, 12 skipped (the 3.1-only deck-sharing and report specs, against the 3.0.0 image). WebKit needed `playwright install-deps webkit` on this host.

## Notes for reviewers

- 17a/17b are not in this restack (another worker ports them onto `d2e516c`).
- The 3.1-only e2e (deck sharing, reports) was not run against a master Servatrice image.
