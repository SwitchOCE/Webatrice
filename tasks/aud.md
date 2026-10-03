# Task aud — accessibility + i18n audit (findings only, no code)

Deliver `specs/aud.md` on your notes branch `claude/notes-aud` (+ status.md). No code branches.

Audit two trees (they'll be joined into one chain later): `origin/claude/restack-21-appearance-i18n-diag` (platform/rooms/moderation/admin/settings/appearance surfaces) and `origin/parity/05-refactor-seat` + `origin/parity/17b-game-menus` + `origin/parity/23d-deck-share` (game board, game menus, decks). Read `.github/instructions/` and the matrix rows LONG-016 (i18n) and LONG-017 (accessibility) in `/tmp/notes/docs/cockatrice-parity-matrix.md`.

1. **LONG-017 accessibility:** enumerate every interactive surface (dialogs, menus, grids/lists, the game board and its zones, drag/drop, context menus, tabs, forms). For each: keyboard path (can every action be done without a mouse? desktop's keyboard shortcuts count), focus management (dialogs trap/restore focus, menus return focus), accessible names/roles (icon buttons, rows, cards), live regions for chat/game log/notifications, colour contrast in light+dark palettes (21). Use the existing shared hooks (`useGridRows`, menu primitives) as the target pattern. Table: `| surface | file | problem | fix | effort S/M/L |`.
2. **LONG-016 i18n:** grep for hard-coded user-visible English in `packages/webatrice/src` (JSX text, `title=`/`aria-label=`/`placeholder=`, toast/alert strings, tab titles built outside components — e.g. TopBar's ~20 literals flagged by 21). Exclude test files and log messages. Table: `| file:line | string | proposed key |`. Also: is there a CI check for missing keys? Propose one (script + where it runs).
3. A suggested split of the fix work into 2–4 PR-sized commits groups with estimates.

Keep it under ~800 lines; group repeated patterns instead of listing every instance.
