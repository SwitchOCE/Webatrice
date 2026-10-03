# Task rv9: review PRs 09, 18, 16 and 17a
Follow /tmp/notes/tasks/review-template.md. Task id: rv9.
- **09** `origin/parity/09-refactor-decks` (parent: `dc77ebd` on `origin/parity/05-refactor-seat`), PR file parity-09-refactor-decks. It is a refactor of the decks feature.
- **18** `origin/parity/18-decks` (parent: `origin/parity/09-refactor-decks`), PR file parity-18-decks. It adds deck folders, undo/redo, legality, banner/tags, sample hand and online services. Check each against the desktop deck editor and the visual deck storage.
- **16** `origin/parity/16-game-lobby` (parent: `dc77ebd`), PR file parity-16-game-lobby. It covers force start, sideboarding in the lobby and invite/copy link. Check against desktop `tab_game.cpp` and `deck_view_container.cpp`.
- **17a** `origin/parity/17a-game-actions` (parent: `origin/parity/05-refactor-seat` 0412500), PR file parity-17a-game-actions. It adds the game menu, reverse turn, next phase with action, rotate view, and two bug fixes. The spec is in /tmp/notes/specs/w17.md.
