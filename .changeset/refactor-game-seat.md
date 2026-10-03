---
'@cockatrice/webatrice': patch
---

Internal refactor of the game seat (`PlayerBox`); no user-visible change.

The seat now has a characterization suite that pins its menus, dialogs, selection, drag-and-drop and command payloads, and the previously skipped game drag/orchestration specs are restored. The card catalog and the Cockatrice `.cod` deck codec move to shared root owners (`services/cards`, `services/decks`, `types`), and the lint boundaries now reject any import from one feature into another.
