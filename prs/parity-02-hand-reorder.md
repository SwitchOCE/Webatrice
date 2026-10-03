# fix(game): reorder hand cards on same-zone drag
## Summary
- Dragging a card to a new slot in your own hand snapped it back: `PlayerBox` treated hand→hand drops as same-zone no-ops.
- The drop now goes through the normal move path and sends `Command_MoveCard` (hand → hand, `x` = insertion slot), as desktop does. The resolved drop index already excludes the dragged cards, so it is the post-removal insertion position.
## Parity rows closed
n/a (regression against desktop hand reordering; part of GAME-016/GAME-019 behaviour)
## Desktop reference
`cockatrice/src/game_graphics/zones/hand_zone.cpp` (handleDropEvent → Command_MoveCard within the zone)
## Testing
- New `packages/webatrice/integration/src/features/game/hand-reorder.spec.tsx`: 3 tests; fail without the fix (3/3), pass with it (3/3).
## Notes for reviewers
None.
