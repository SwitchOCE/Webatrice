---
'@cockatrice/datatrice': patch
---

The game listeners are split by domain (zones, cards, counters, arrows, players, phases) with their planning moved into pure, tested helpers; every game event dispatches the same actions as before. `games.Selectors.getArrowsTouchingCard` is new: it lists every arrow, on any player, with an endpoint on a given card (`ArrowRef[]`).
