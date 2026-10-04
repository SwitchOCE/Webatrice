# feat(decks): finish deck i18n and make the deck editor keyboard- and screen-reader-usable

> **Stacks on `claude/restack-28-i18n-gate`** (`bcced39`). Branch `claude/parity-31-deck-i18n-a11y`. This is audit PR **D2** (`specs/aud.md` §2.2, decks part; §3 row D), together with deck accessibility rows **D1–D6** (§1.2). It touches nothing in `features/game`.

## Summary

**i18n (D2).** About 200 lint hits plus the English that helpers built in plain `.ts` files are now catalogue strings. `features/decks` comes off PR 28's `no-literal-string` off-list, so lint now covers the whole tree apart from `features/game`. The catalogue grows from 1855 to 2097 keys (+242, none removed), and `i18n:check` passes. The English text is unchanged.
- Plurals that used to be built by concatenation or a ternary are now ICU plurals: card counts, `Showing {n} results`, `{n} decks on this server`, the price "missing" note and the mana-curve tooltip.
- Deck ages use `Intl.RelativeTimeFormat` in the UI language (`formatDeckAge(seconds, locale)`), so English still reads "3h ago".
- Helpers that used to return English now take `t` or return keys: `buildPastedDeckCod`, `buildUploadedDeckCod`, `summarizeUploadedDeck`, `deckSectionLabel`, `formatDeckAge`, and the error fallbacks in `useScryfallCardSearch` and `useBracketAssessment`.
- Four values stay literal on purpose because the server or file format stores them, as the audit said: the default deck tags, `deckExport` section headers, the server's `Unnamed deck`, and the `Deck #N` fallback.
- New namespaces: `ImportDeckDialog`, `DeckImport`, `CardDetailDialog`, `PrintingPicker`, `CreateDeckDialog`, `DeleteDeckDialog`, `ExportDeckDialog`, `CardSearch`, `DeckBreakdown`, `FormatPicker`, `DeckSummary`. Existing ones are extended: `DeckEditor`, `Decks`, `DeckSidebar`, `DeckBracket`, plus `Common.action.{delete,remove,copy,back}` and `Common.status.{loading,copied}`.

**D1 — deck dialogs.** `DeckDialogFrame` is now built on `useDialogFocus`, the hook behind PR 26's `DialogShell`:
- focus moves into the panel's content, skipping a header Close button (`[data-dialog-content]`);
- Tab stays inside the dialog;
- Escape closes the dialog through React. A dialog can override Escape: the share-link list uses this to back out of a pending revoke first;
- closing returns focus to the control that opened the dialog.

All twelve deck dialogs get this, `DeleteDeckDialog` included. That dialog is now an `alertdialog` described by its message, like the folder delete. `useEscapeKey` had no callers left and is deleted. I kept the per-dialog panels rather than moving them into `DialogShell`, because their layouts (card detail, printings grid, import steps) don't fit the shell's header/body/footer.

**D2 — share dialog.**
- After the link is created, focus moves to the link field, selected and ready to copy. Before, the name field unmounted and focus fell to `<body>`.
- One `role=status`, mounted with the dialog, announces creating, created/copied and "Copied".

**D3 — quick add.** The field is an ARIA 1.2 combobox:
- it is named "Quick add a card" and has `aria-autocomplete=list`;
- it owns a `listbox` of `option`s, with `aria-expanded`, `aria-controls` and `aria-activedescendant`, so focus stays in the field;
- a polite status announces searching, "{n} suggestions" or no matches;
- Escape closes the list first and only then clears the field.

PR 25a's mention completer is not below this branch, so this combobox is local to quick add.

**D4 — row actions menu.** `DeckRowActionsMenu` is now PR 26's `Menu`, opened from the chevron, a right-click, Shift+F10 or the Menu key. That matches desktop's deck-view context menu.
- It has focus-in, arrows, type-ahead, and focus return to the row.
- Add one and Remove one stay open and show their rebindable key hints (`useMenuShortcut`). A quantity change is announced from the row.
- New entry: **Card details** (MTG decks).
- "Move to sideboard" on the commander is `aria-disabled` and says why.
- The menu's name is "Actions for {card}".

**D5 — hover-only affordances.**
- Advanced-search tiles preview on focus, show their Add overlay on `focus-visible`, and carry a name.
- The result count sits in a status region mounted with the search, and each add is announced.
- Rows in My Decks and in the plain card list show their actions while focus is anywhere in the row.

**D6 — deck shortcuts and the card list.**
- **The card list is a grid per section on `useGridRows`.** The whole deck has one tab stop, and ↑/↓/Home/End move across sections. The focused row takes desktop's deck-view keys (`DeckEditorDeckDockWidget`, `KeySignals`):
  - Enter, Shift+→ and Ctrl+Alt+= add a copy;
  - Shift+← and Ctrl+Alt+− remove one;
  - Delete removes the row;
  - Shift+S swaps it between main and sideboard (the commander stays in main);
  - the rebindable `deck.addCard`/`deck.removeCard` (+ / −) act on the focused row.

  Focus follows a row that changes section and passes to the neighbour of a row that is removed. The name and chevron stay clickable but leave the tab order.
- **`deck.save`** sends a pending change now, or retries a failed save. The editor autosaves, so this is desktop's Save Deck.
- **`deck.new` and `deck.load`** open the create and import dialogs on My Decks; from the editor they navigate there and open the dialog.

## Parity rows closed
- **LONG-016 decks (audit D2)**: closed. `features/decks` is off the lint off-list, and only `features/game` (D3) remains.
- **D1–D6** (aud.md §1.2): closed as described above.

## Desktop reference
Cockatrice `add65caa`.
- Deck-view keys: `cockatrice/src/interface/widgets/deck_editor/deck_editor_deck_dock_widget.cpp:94-101`. They are Shift+S swap, Enter, Ctrl+Alt+= and Shift+→ to increment, Ctrl+Alt+− and Shift+← to decrement, Delete to remove. The custom context menu is `decklistCustomMenu`.
- Shortcut catalogue: `cockatrice/src/client/settings/shortcuts_settings.h:201-262`. It covers `TabDeckEditor/aIncrement` (+), `aDecrement` (−), `aNewDeck` (Ctrl+N), `aLoadDeck` (Ctrl+O) and `aSaveDeck` (Ctrl+S).
- **Divergences:**
  - New and Load go to My Decks (create / import) rather than opening a new editor tab or a file picker. Webatrice's decks live in server storage, and import covers both file and clipboard.
  - Save flushes the autosave rather than writing a file.
  - Dialog focus, live regions and the combobox are the sanctioned accessibility divergence (`webatrice.instructions.md`, divergence protocol item 3); Qt dialogs are separate windows.

## Testing
All runs are from the repo root on tip `87a20ef`, after `npm ci`.
- `npx turbo run typecheck --concurrency=1`: 5/5 tasks passed.
- `npm run lint`: 3/3 packages, 0 problems. `npm run -w @cockatrice/webatrice i18n:check`: 110 catalogues, 719 sources, all keys resolve.
- `npm test -- -- --maxWorkers=2`: sockatrice **896** passed, datatrice **1316** passed. On this 15 GB host the webatrice run in one process was OOM-killed twice (exit 137; worker heap above 6 GB), so I ran it in two halves: `src/features/game` **1322 passed**, everything else **2467 passed**, **3789 total, 0 failed**.
- `npm run test:integration -- -- --maxWorkers=2`: sockatrice **175**, datatrice **145**, webatrice **270 passed**.
- New or changed specs:
  - new: `DeckDialogFrame.spec` (4), `useDeckCardGrid.spec` (7, through the real `ShortcutProvider`);
  - extended: `ShareDeckDialog` (+1), `QuickAddSearch` (+2), `DeckRowActionsMenu` (rewritten, 9), `DeckCardRow` (+3), `AdvancedCardSearch` (+1), `Decks` (+2: Ctrl+N/Ctrl+O, and arriving with a dialog request);
  - the deck integration specs now query by key and role.
- e2e: browsers ran in `mcr.microsoft.com/playwright:v1.60.0-noble`, because this host's browser build doesn't match the pinned Playwright.
  - New `deck-keyboard.spec.ts`: create a deck, quick-add, change the count with keys and the menu, Ctrl+S, then share. On the 3.1 image (`webatrice-local/servatrice:master-add65ca`), `deck-keyboard` + `decks` + `deck-sharing` + `keyboard-only` gave **15 passed, 3 skipped** across chromium, firefox and webkit. The skips are deck-sharing's 3.0-only case.
  - Full suite on the default 3.0 image: **87 passed, 12 skipped, 3 failed** (21.0 min). The three failures are `staff-tools.spec.ts:39` on each browser with `spawnSync docker ENOENT` at its SQL seeding: the Playwright container has no docker CLI, the same environment failure recorded in PRs 26 and 28. `replays.spec.ts`, which failed on those runs, passes here.
- The e2e network fixture now stubs Scryfall `/cards/autocomplete` from the card fixtures, which quick add needs.
- `npm run test:e2e -w @cockatrice/sockatrice` was not run: no command shape or server flow changed.

## Notes for reviewers
- **Where to look first:** `hooks/useDeckCardGrid.ts` (row keys and focus hand-off), `DeckCardRow.tsx` (grid row that owns its `Menu`), `DeckDialogFrame.tsx`.
- **Grid shape.** Each section is its own `role=grid` named by its heading, because a heading cannot sit inside a `rowgroup`. One `useGridRows` spans all of them, so the whole deck is still a single tab stop.
- **Row identity** is `category:name`, the same pair the editor uses to re-resolve the detail dialog. Rows are keyed by it, so a row that moves section remounts and focus waits for it there.
- **Enter adds a copy**, as desktop does, and does not open details. Details are reachable from the row menu (Shift+F10), and the preview already follows focus.
- **Commits are not green one by one:** the integration spec fixes (`87a20ef`) belong to `60c6797` and `3d081d8`. Fold them in at the restack, since a cloud session can't `rebase -i` safely across a mixed split.
- **Changeset:** `.changeset/deck-i18n-a11y.md` (`@cockatrice/webatrice`: patch).
- **Follow-ups:**
  - The webatrice unit suite needs more than ~15 GB in one process here; worth a look at worker heap (`isolate: true` plus the game specs).
  - Translator-visible English for desktop deck terms was kept as-is, not realigned to desktop's wording.
