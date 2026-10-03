# fix(game): reorder hand cards on same-zone drag
## Summary
- Dragging a card to a new slot in your own hand snapped it back: `PlayerBox` treated hand→hand drops as same-zone no-ops.
- The drop now goes through the move path and sends `Command_MoveCard` (hand → hand, `x` = insertion slot), as desktop does. The resolved drop index leaves out the dragged cards, so it is the post-removal insertion slot. That matches desktop's vertical-hand calculation; desktop's horizontal hand counts the dragged card and sends a pre-removal index (hand_zone.cpp:37-45).
- **Multi-card groups keep their order.** Servatrice applies a multi-card move one card at a time in ascending position, removing each and inserting it at `x + k` while the other dragged cards are still in the zone (server_abstract_player.cpp:417-428). One command with the drop index scrambles a group. The new `planHandReorder` replays that remove-then-insert on a copy of the hand order and sends one single-card command per dragged card, so the group lands contiguous at the drop slot in its current order. A single-card drag still sends one command with `x` = drop index.
- **Dropping a hand card on the "View hand" dialog does nothing**, as before this PR. The dialog's drop target appends (`x` = hand size), which is right for cards coming from other zones but would move a hand card to the end of the hand.
- Only your own hand order visibly changes. For a private-zone move, other players get no card id, `x` or position (server_abstract_player.cpp:488-500).
## Parity rows closed
n/a (regression against desktop hand reordering; part of GAME-016/GAME-019 behaviour)
## Desktop reference
- `cockatrice/src/game_graphics/zones/hand_zone.cpp` (handleDropEvent → Command_MoveCard within the zone; :37-45 horizontal vs vertical index, :48-60 no skip for a drop on the card's own slot)
- `libcockatrice_network/.../server_abstract_player.cpp:417-428` (per-card remove-then-insert at `x + xIndex`), `server_move_card_struct.h:18-23` (ascending order), `server_cardzone.cpp:308-321` (non-coord zones insert at `x`, append past the end)
## Testing
Final tip `d3909f3`, from the repo root:
- `npx turbo run typecheck --concurrency=1`: passes (5/5 tasks).
- `npm run lint`: passes (0 errors, 0 warnings; `--max-warnings 0` from PR 01).
- `npm test`: Sockatrice 604 passed; Datatrice 1083 passed; Webatrice 1183 passed, 2 skipped (163 files, 2 skipped). The skips predate this series.
- `npm run test:integration`: Sockatrice 146 passed; Datatrice 124 passed; Webatrice 136 passed, 2 skipped (33 files, 2 skipped).
- `handReorder.spec.ts` (12 tests): single-card x, group to the end (`[A,B,C]`, `{A,B}` → `[C,A,B]`), hand-position order regardless of selection order, a table of group placements, an exhaustive check over every subset and slot of a 6-card hand (lands contiguous at the slot, and replaying the plan on its result is a no-op, which the optimistic dispatch plus server echo relies on), clamping, and unknown ids.
- `integration/.../hand-reorder.spec.tsx` (7 tests): the three single-card drops now also assert the optimistic order right after the drop; the server echo with a different `x` wins and drains the optimistic marker; a drop on the card's own slot sends its index and leaves the order unchanged; a two-card group sends one command per card (`x` 2, 2) and ends `[103,101,102]`; a hand card dropped on the hand viewer sends no `Command_MoveCard`. Without the PlayerBox fixes, the group and hand-viewer cases fail (2/7); with them, 7/7 pass.
- e2e not run: the change adds no new server flow, and the wire shape is covered by the integration spec.
## Notes for reviewers
- Commits: the original reorder commit (body reworded per review), then `fix(game): ignore a hand card dropped on the hand viewer`, then `fix(game): keep a multi-card hand reorder in order`. Each typechecks.
- The hand strip has `data-testid="hand-zone-<playerId>"`; the spec scopes to it because the hand viewer renders the same cards.
- Rebased onto the fixed PR 01 (`claude/parity-01-lint`).

## Review response
rv1, PR 02 section:
- **major, hand pile-view drop regression:** fixed. A hand card released on the hand viewer resolves to no drop target, so nothing is sent. Both stale "same-zone no-op" comments are corrected. Integration case added; it fails without the fix.
- **major, multi-card order:** fixed with one single-card command per card (`planHandReorder`), not the `cards.length > 1` guard, so group drags work. Unit and integration cases added; the integration case fails without the fix.
- **minor, echo assertion can't fail:** the spec now asserts the optimistic order right after `pointerUp`, then delivers an echo with a different `x` and checks that it wins and that the optimistic marker is drained.
- **minor, missing cases:** added the own-slot drop, the two-card group and the hand-viewer drop.
- **minor, overstated claims:** the commit body, Summary and changeset now say the index matches desktop's vertical hand only, and that only your own hand order updates.
- **nit, `parentElement` chain:** replaced with the `hand-zone-<playerId>` test id.
- **nit, comment scope at the reorder branch:** the comment now says only the hand strip yields a hand→hand target.
