/**
 * Plans the `Command_MoveCard(hand → hand)` sequence for a drag reorder
 * within the local hand.
 *
 * Servatrice moves a multi-card command one card at a time in ascending
 * position: each card is removed, then inserted at `x + k` while the
 * other dragged cards are still in the zone
 * (server_abstract_player.cpp:417-428). One command with the drop index
 * therefore scrambles a group (hand [A,B,C], drag {A,B} to the end →
 * [A,C,B]). Instead send one single-card command per dragged card, each
 * `x` computed by replaying the server's remove-then-insert on a copy of
 * the hand order, so the group lands contiguous and in its current
 * relative order.
 *
 * `targetIndex` is the insertion slot among the hand cards that are NOT
 * being dragged (what the hand strip's hit-test computes). Ids missing
 * from `handOrder` are ignored.
 */
export function planHandReorder(
  handOrder: readonly string[],
  draggedIds: readonly string[],
  targetIndex: number,
): { cardId: string; x: number }[] {
  const dragged = new Set(draggedIds);
  const group = handOrder.filter((id) => dragged.has(id));
  const others = handOrder.filter((id) => !dragged.has(id));
  // The group goes in front of this card, or at the end when undefined.
  const anchor = others[Math.max(0, Math.min(targetIndex, others.length))];

  const order = handOrder.slice();
  const plan: { cardId: string; x: number }[] = [];
  let previous: string | undefined;
  for (const cardId of group) {
    order.splice(order.indexOf(cardId), 1);
    const x = previous !== undefined
      ? order.indexOf(previous) + 1
      : anchor !== undefined ? order.indexOf(anchor) : order.length;
    order.splice(x, 0, cardId);
    plan.push({ cardId, x });
    previous = cardId;
  }
  return plan;
}

/**
 * The same plan for a hidden zone (the library), whose cards are addressed
 * by their current position rather than a stable id: each step's `cardId` is
 * where that card is when its command runs, after the steps before it.
 * `positions` are the moved cards' positions now; `targetIndex` is the place
 * among the cards not moved. The zone past the last position involved never
 * shifts, so it is replayed only that far.
 */
export function planPositionalReorder(
  positions: readonly number[],
  targetIndex: number,
): { cardId: number; x: number }[] {
  const moved = [...new Set(positions)].sort((a, b) => a - b);
  if (moved.length === 0) {
    return [];
  }
  const length = Math.max(moved[moved.length - 1] + 1, targetIndex + moved.length);
  const order = Array.from({ length }, (_, i) => String(i));
  const current = order.slice();
  return planHandReorder(order, moved.map(String), targetIndex).map(({ cardId, x }) => {
    const position = current.indexOf(cardId);
    current.splice(position, 1);
    current.splice(x, 0, cardId);
    return { cardId: position, x };
  });
}
