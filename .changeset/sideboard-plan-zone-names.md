---
'@cockatrice/webatrice': patch
---

The in-game sideboard plan now names its zones `main` and `side`, as desktop Cockatrice does. It used the in-game zone names `deck` and `sb`, which Servatrice silently ignores, so an applied plan never changed the next game's deck.
