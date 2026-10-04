/**
 * Desktop's card view heights (ZoneViewWidget), in rows: each row is a third of a card, the
 * overlap of a pile, and a view N rows tall shows N + 1 thirds plus 5 px so the cut-off card
 * reads as one.
 */
export function cardViewRowsHeight(rows: number, cardHeightPx: number): number {
  return ((rows + 1) * cardHeightPx) / 3 + 5;
}

/**
 * The card area height a double-click on a card view's title bar switches to
 * (ZoneViewWidget::expandWindow): back to the initial height when the view is shorter than it,
 * already expanded, or as tall as it can get short of expanded; otherwise up to the expanded
 * height. Both are capped at `maxHeight`: the height of the zone's contents (the widget's maximum
 * size on desktop) or the room the page has, whichever is less.
 */
export function toggledCardViewHeight(
  current: number,
  { initial, expanded, maxHeight }: { initial: number; expanded: number; maxHeight: number },
): number {
  const near = (a: number, b: number) => Math.abs(a - b) < 1;
  const reset = current < initial
    || near(current, Math.min(expanded, maxHeight))
    || (near(current, maxHeight) && current > initial && current < expanded);
  return reset ? Math.min(initial, maxHeight) : Math.min(expanded, maxHeight);
}
