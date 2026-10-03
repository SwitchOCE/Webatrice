---
'@cockatrice/webatrice': patch
---

Dragging a card within your own hand now reorders it. The drop used to be discarded as a same-zone no-op; it now sends `Command_MoveCard` from hand to hand at the drop slot, as desktop does, so every client sees the new order.
