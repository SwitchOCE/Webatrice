# Task aud2: architecture audit of the remaining large files (read-only; findings only)

Write `specs/aud2.md` on your notes branch. Base: `origin/claude/restack-16-game-lobby` (the refactored tree). Don't change code.

Context: the refactor line (PR 05, Stages 1–5; PR 09) removed PlayerBox (11,288 lines), split GameBoardCell, useGameDialogs, DeckEditor and Decks, and walled off feature folders. Read `/tmp/notes/prs/parity-05-refactor-seat.md` and `parity-09-refactor-decks.md` for the target architecture and idioms (seat model + ports, region components, feature boundaries, `@app/hooks`).

1. List every non-test source file over 500 lines in `packages/webatrice/src`, `packages/datatrice/src` and `packages/sockatrice/src`, with line counts.
2. For each one, judge the **architecture, not the size**. Look for:
   - mixed responsibilities (UI + protocol + state);
   - duplicated models;
   - logic that should be a hook or service;
   - prop drilling or god components;
   - untested branches;
   - layering violations the lint wall doesn't catch.

   A long file with one cohesive responsibility is fine; say so.
3. Find duplicate implementations anywhere in the tree: two models of the same concept, copy-pasted handlers, parallel menu, dialog or grid systems. The known ones are the two game menu stacks, the orphaned CardSlot and the duplicated library menu; PR 30 owns those, so confirm them only briefly.
4. Output a table: file | lines | verdict (fine / refactor) | problem | proposed split, with target modules and the existing idiom to follow | effort | conflicts with the planned PRs. The planned PRs are: 17a/17b ported (game menus), 17c shortcuts, 25b board prefs, 29/30 game a11y (touches ZoneStack, ZoneViewPanel, cards, menus, dialogs), 31 deck i18n/a11y, and 32 game i18n.
5. Propose at most 3 refactor PRs, ordered, each placed in the merge order after the PRs it conflicts with.

Status line when done: `→ done`.
