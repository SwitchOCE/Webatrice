---
'@cockatrice/webatrice': patch
---

Internal refactor of the game seat (`PlayerBox`). The one visible change: card counter badges and their menu swatches now use desktop Cockatrice's counter colours, the same ones the rest of the game already uses.

The seat now has a characterization suite that pins its menus, dialogs, selection, drag-and-drop and command payloads, and the previously skipped game drag/orchestration specs are restored. The card catalog and the Cockatrice `.cod` deck codec move to shared root owners (`services/cards`, `services/decks`, `types`), and the lint boundaries now reject any import from one feature into another.

The seat is now described by a `PlayerBoardModel` built from game state and four grouped command ports (zone, card, counter, target) that own every request payload, optimistic update and rollback. Battlefield layout, card placement, the card menu model, P/T and life-expression parsing and zone-view sorting move out of `PlayerBox` to their owning modules with table tests.
