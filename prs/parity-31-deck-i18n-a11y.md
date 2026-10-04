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
- One `role=status`, mounted with the dialog, announces creating, created/copied and "Copied". Each Copy empties it first, so a repeated "Copied" is announced again. A refused clipboard write says so, visibly and in the status, and selects the link for copying by hand.

**D3 — quick add.** The field is an ARIA 1.2 combobox:
- it is named "Quick add a card" and has `aria-autocomplete=list`;
- it owns a `listbox` of `option`s, with `aria-expanded`, `aria-controls` and `aria-activedescendant`, so focus stays in the field;
- a polite status announces searching, "{n} suggestions" or no matches;
- Escape closes the popup first (the list, or the searching / no-matches note) and drops the highlight; a second Escape clears the field;
- Enter adds the highlighted option only while the list announces it; with the list closed it adds the typed name.

PR 25a's mention completer is not below this branch, so this combobox is local to quick add.

**D4 — row actions menu.** `DeckRowActionsMenu` is now PR 26's `Menu`, opened from the chevron, a right-click, Shift+F10 or the Menu key. That matches desktop's deck-view context menu.
- It has focus-in, arrows, type-ahead, and focus return to the row.
- Add one and Remove one stay open and show their rebindable key hints (`useMenuShortcut`). Those keys also work while the menu is open: `Menu` gained an `onKeyDown` that sees a level's keys before navigation and type-ahead. A quantity change is announced from the row.
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
  - the rebindable `deck.addCard`/`deck.removeCard` (=, + (Shift+=) and NumpadAdd / − and NumpadSubtract) act on the focused row.

  Focus follows a row that changes section and passes to the neighbour of a row that is removed; when the last row goes, it moves to the toolbar's add field. The name and chevron stay clickable but leave the tab order.
- **`deck.save`** sends a pending change now, or retries a failed save. The editor autosaves, so this is desktop's Save Deck.
- **`deck.new` (Ctrl+Alt+N) and `deck.load` (Ctrl+O)** open the create and import dialogs on My Decks; from the editor they navigate there and open the dialog.
- **My Decks delete:** once the server drops a deleted deck, focus moves to the next deck's row (else the previous one, else the list) instead of falling to `<body>`.

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
  - New deck is **Ctrl+Alt+N**, not desktop's Ctrl+N: Chromium-family browsers keep Ctrl+N (new window) and never pass it to the page. This follows the game's deck-flip rebinds (`defaults.ts`). The reserved chords live in `feature-widgets/shortcuts/browserReserved.ts`, and `defaults.spec` checks that no default lands on one.
  - Desktop's "+" is bound as Shift+Equal next to `=`, so it works on US layouts.
  - Dialog focus, live regions and the combobox are the sanctioned accessibility divergence (`webatrice.instructions.md`, divergence protocol item 3); Qt dialogs are separate windows.

## Testing
Final runs are from the repo root on tip `b85d1f5`, after `npm ci`. The original PR's runs on `87a20ef` are superseded.
- `npx turbo run typecheck --concurrency=1`: 5/5 tasks passed.
- `npm run lint`: 3/3 packages, 0 problems. `npm run -w @cockatrice/webatrice i18n:check`: 110 catalogues, 721 sources, all keys resolve.
- `npm test -- -- --maxWorkers=2`: sockatrice **896** passed, datatrice **1316** passed. The webatrice run in one process stalled near the end and was killed at the time limit (the known memory problem T1 is fixing), so I ran it in two chunks: `src/features/game` **1322 passed**, everything else **2513 passed**, **3835 total, 0 failed**.
- `npm run test:integration -- -- --maxWorkers=2`: sockatrice **175**, datatrice **145**, webatrice **270 passed**. The first run had 1 failure (`deck-editor.spec` still used a catalogue key that `587892a` had moved); `d7084c5` fixed it, and the webatrice rerun passed 270/270.
- Each behaviour fix in the rv22 round has a spec that I watched fail against the pre-fix code and then pass.
- e2e: browsers ran in `mcr.microsoft.com/playwright:v1.60.0-noble`, against the default 3.0 image and a locally built 3.1 image (`webatrice-local/servatrice:master-add65ca`).
  - Full suite on 3.0, on `d7084c5`: **84 passed, 12 skipped, 6 failed** (21.0 min). Three failures were the new `deck-keyboard` Escape-then-Enter step: once Forest is in the deck, the banner-card picker's `<option>` also matched `getByRole('option', { name: 'Forest' })`. `b85d1f5` scopes the step to the suggestions listbox. The other three are `staff-tools.spec.ts:39` on each browser, failing with `spawnSync docker ENOENT` at its SQL seeding. The Playwright container has no docker CLI; this is the same environment failure recorded in PRs 26 and 28.
  - On `b85d1f5`, `deck-keyboard` + `decks` + `deck-sharing` + `keyboard-only` across chromium, firefox and webkit gave:
    - 3.0: **12 passed, 6 skipped** (the share steps and specs that need 3.1);
    - 3.1: **14 passed, 3 skipped, 1 failed**. The failure was `decks.spec.ts:11` on chromium only: a 120 s timeout waiting for a newly created folder to appear. It was the first spec against a freshly started server. It passed on firefox and webkit in the same run, and passed 3/3 when rerun alone on chromium (`--repeat-each=3`) against the 3.1 image. Folder creation is untouched by this PR. I could not reproduce it and did not establish a cause.
- `npm run test:e2e -w @cockatrice/sockatrice` was not run: no command shape or server flow changed.

## Notes for reviewers
- **Where to look first:** `hooks/useDeckCardGrid.ts` (row keys and focus hand-off), `DeckCardRow.tsx` (grid row that owns its `Menu`), `DeckDialogFrame.tsx`.
- **Grid shape.** Each section is its own `role=grid` named by its heading, because a heading cannot sit inside a `rowgroup`. One `useGridRows` spans all of them, so the whole deck is still a single tab stop.
- **Row identity** is `category:name`, the same pair the editor uses to re-resolve the detail dialog. Rows are keyed by it, so a row that moves section remounts and focus waits for it there.
- **Enter adds a copy**, as desktop does, and does not open details. Details are reachable from the row menu (Shift+F10), and the preview already follows focus.
- **Commits are not green one by one:** the integration spec fixes (`87a20ef`) belong to `60c6797` and `3d081d8`. The rv22 fix round added two more spec-only follow-ups: `efe569d` belongs to `3c63b11` and `d7084c5` to `587892a`. `2a4e842` (a lint fix) belongs to `0a553b8`. The f31 task ruled out a history rewrite, so fold all of them in at the restack. Typecheck, lint and tests were run on the tip, not on each commit.
- **Changeset:** `.changeset/deck-i18n-a11y.md` (`@cockatrice/webatrice`: **minor**, as `webatrice-a11y-keyboard-paths` was for new keyboard features). It now covers the keyboard, screen-reader and shortcut changes as well as the translation work.
- **Shared changes outside decks:** `Menu` gains an optional `onKeyDown` (runs before navigation and type-ahead; `preventDefault` claims the key). `ShortcutProvider` now skips a key event that is already `defaultPrevented`, so a key a focused control handled is not also a shortcut. `feature-widgets/shortcuts` exports `matchesEvent` and adds `browserReserved.ts`.
- **Follow-ups:**
  - **Shared combobox:** quick add and 25a's `useMentionCompleter` both hand-roll the listbox ids, ARIA props, highlight cycling and Escape, and already differ (Escape is one step there, two here). Whichever of 31 and 25a lands second should extract a shared `useListboxCombobox` into `@app/hooks` and use it in both.
  - **Reserved keys:** 17c's `defaults.spec` keeps its own inline reserved-key list (GAME scope only). Whichever of 17c and 31 lands second should import `BROWSER_RESERVED_SEQUENCES` from `browserReserved.ts` and drop the inline copy. This PR's assertion covers every scope, so it is a superset.
  - The webatrice unit suite needs more than ~15 GB in one process here; worth a look at worker heap (`isolate: true` plus the game specs).
  - Translator-visible English for desktop deck terms was kept as-is, not realigned to desktop's wording.

## Review response (rv22)
- **Major: quick add, Escape then Enter added a hidden suggestion.** Fixed (`c0708a5`). Escape clears the highlight, and Enter uses a suggestion only while `aria-activedescendant` announces it; otherwise it adds the typed text. Unit specs cover this, and `deck-keyboard.spec` reproduces "Fore" → Escape → Enter on all three browsers.
- **Major: `deck.new` on browser-reserved Ctrl+N.** Fixed (`a3d7c67`). It is rebound to Ctrl+Alt+N, following the "Rebound" convention. I did not keep Ctrl+N as a second sequence, because the task asked for an assertion that no default uses a reserved chord. The reserved list is `browserReserved.ts`, with the same chords as 17c's spec plus Ctrl+Digit2–8; `defaults.spec` checks every action in every scope against it.
- **Minor: "+" did nothing.** Fixed: Shift+Equal added to `deck.addCard` (`74ce93b`).
- **Minor: the menu's key hints didn't work while it was open.** Fixed: `Menu` `onKeyDown`, and the row menu runs the resolved bindings (`33ab0da`).
- **Minor: removing the last row dropped focus.** Fixed: focus moves to the toolbar's add field (`5a75e1a`).
- **Minor: deleting a deck dropped focus.** Fixed: focus goes to the next deck once the server confirms (`c96a970`).
- **Minor: copy feedback.** Fixed: failures are announced and shown with the link selected, and each copy is re-announced (`0fb1227`).
- **Minor: first Escape while "Searching…" / "No matches".** Fixed in `c0708a5`: the first Escape is based on the popup being visible.
- **Minor: unknown-card warning was title-only.** Fixed: it joins `aria-description` and the icon is a named image (`3c63b11`).
- **Minor: advanced search field had no name.** Fixed (`4b7d8c6`).
- **Minor: changeset.** Rewritten and bumped to minor (`9f2c097`).
- **Minor: red intermediate commits.** Not folded. The f31 task said "no history rewrite", so the fold is left for the restack and the commits are listed under Notes for reviewers.
- **Minor: duplicated combobox logic.** Recorded as a follow-up, as proposed.
- **Nit: chevron comment.** Fixed (`9be8271`).
- **Nit: Shift+S matched `code`.** Fixed: it now matches by `key`, with a Dvorak spec (`59baade`).
- **Nit: `defaultPrevented`.** Fixed in `ShortcutProvider` (`69830fd`). The full unit, integration and e2e runs show no regressions from it.
- **Nit: duplicated catalogue strings.** Fixed: the card detail dialog now uses the `DeckEditor.rowActions.*` keys and `PrintingPicker.priceUsd` (`587892a`).
- **Nit: "·" inside messages.** Moved into JSX (`f63c166`).
- **Nit: row order computed twice.** `PlainCardList` now takes `order` from the pane (`5e5064d`).
- **Nit: `RelativeTimeFormat` per row.** It is now cached per locale (`0a553b8`).

