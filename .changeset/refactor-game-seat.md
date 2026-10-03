---
'@cockatrice/webatrice': patch
---

Internal refactor of the game seat (`PlayerBox`), with a few visible changes:

- Card counter badges and their menu swatches use desktop Cockatrice's counter colours, the same ones the rest of the game already uses.
- Mulligan (Ctrl+M), Set life (Ctrl+L) and Remove local arrows (Ctrl+R) are now rebindable in the Shortcuts settings, with desktop's defaults.
- Another player's cards can no longer be dragged (the server always rejected the move); clicking them still selects them. A judge can drag any player's cards, and the move is sent on that player's behalf, as on desktop.
- While dragging onto a battlefield, the landing slot is highlighted on the board under the pointer, including an opponent's when gifting a card.
- Escape clears a card selection on the board.
- The seat's number and text prompts (set life, P/T, annotation, counters, library counts) and its Create token dialog are now the game's shared dialogs, and only one card menu is open at a time across all seats.
- The library, graveyard, exile, hand and sideboard views are game-level zone views: graveyard, exile and hand views can stay open side by side, Escape closes the most recent one (a library view still shuffles on close when "shuffle when closing" is ticked), and Select All / Select Column in a graveyard or exile view now select cards, which Clone then copies.

The seat now has a characterization suite that pins its menus, dialogs, selection, drag-and-drop and command payloads, and the previously skipped game drag/orchestration specs are restored. The card catalog and the Cockatrice `.cod` deck codec move to shared root owners (`services/cards`, `services/decks`, `types`), and the lint boundaries now reject any import from one feature into another.

The seat is now described by a `PlayerBoardModel` built from game state and four grouped command ports (zone, card, counter, target) that own every request payload, optimistic update and rollback. Battlefield layout, card placement, the card menu model, P/T and life-expression parsing and zone-view sorting move out of `PlayerBox` to their owning modules with table tests.

Selection, card preview, keyboard shortcuts and drag-and-drop now run through the game-level owners instead of per-seat copies: one selection for the whole game, one preview store, every key binding registered by `useGameShortcuts`, and every seat drag coordinated by `useGameDnd` with the shared optimistic move path. `PlayerBox` loses its window pointer listeners, DOM drop hit-testing and module-level selection singleton.

Menus, prompts and zone views converge on the game dialogs: the seat's card menus render through `CardContextMenu`, its prompts through `PromptDialog`, its zone viewers through `ZoneViewDialog`, and "Put top cards on stack until…" moves to `MoveTopUntilDialog` with its loop in `useMoveTopUntil`.
