# feat(webatrice): deck folders, undo/redo, legality, banner/tags, sample hand and online services

## Summary

- **Remote folder tree (GAME-002).** My Decks shows Servatrice deck storage one folder at a time, like desktop's
  remote tree in `TabDeckStorage`:
  - folder rows with deck counts, a breadcrumb, and the folder in the URL (`?folder=a/b`);
  - New folder (`deckNewDir`), with desktop's rules: `/` becomes `-`, and the path stays within 255 characters.
    A name already used by a sibling is refused;
  - Delete folder (`deckDelDir`). The confirmation states how many decks and subfolders go with it;
  - New deck and Import upload into the shown folder;
  - a deck or a whole folder downloads as `.cod` files;
  - Move deck to another folder (see notes).
- **Undo/redo and history (GAME-005).** Ports `DeckStateManager` + `DeckListHistoryManager(Widget)`:
  - each card and metadata edit saves a named memento;
  - undo/redo work from buttons, from shortcuts registered with the shortcuts widget (`deck.undo` Ctrl+Z,
    `deck.redo` Ctrl+Y / Ctrl+Shift+Z), and from a history list whose entries jump several steps;
  - a new edit clears redo, and a typing burst in the name is one entry;
  - the autosave settles the server on the restored deck.
- **Legality (GAME-004).** Ports `isCardQuantityLegalForFormat` / `refreshCardFormatLegalities` and
  `DeckListStyleProxy`: illegal rows are painted red with the reason, and the sidebar has a summary.
  - Imported format rules apply: `allowedCounts` and `exceptions` with name/text/property conditions.
  - Without rules, a card passes when its label is legal or restricted.
  - Card legality comes from cards.xml `format-*` props, else Scryfall `legalities`.
- **Banner card and tags (GAME-006).** A banner picker (every distinct card and printing, plus "-") and a tag editor
  (desktop's default tags; empty and duplicate tags refused), both undoable.
  - `<tags>` stays raw XML, and only `<tag>` children are rewritten.
  - `<bannerCard providerId>` now round-trips.
- **Sample hand (GAME-007).** A collapsible panel: hand size (default 7, minimum 1, remembered), redraw, sorted by
  mana value. It draws from the main deck only and never touches the deck.
- **Online services and print (GAME-009).** Print, decklist.org/.xyz export, and deckstats/TappedOut analyze. Load
  from a website is a copy/paste handoff (per-site table below).
- **09 follow-ups fixed.**
  - Autosave now uploads only when the deck changed. The dirty check compares a timestamp-free
    `deckSaveSignature` with the last signature the server acknowledged.
  - Autosave goes through a new Sockatrice `deckUpdate` command with Datatrice reducers, not a raw
    `Command_DeckUpload`.
  - A failed save shows desktop's "The deck could not be saved." with Retry.

## Parity rows closed

GAME-002, GAME-004, GAME-005, GAME-006, GAME-007, GAME-009 (`Webatrice/docs/cockatrice-parity-matrix.md`).

## Desktop reference

- `cockatrice/src/interface/widgets/tabs/tab_deck_storage.cpp`: `actNewFolder`, `actDeleteRemoteDeck`,
  `deleteRemoteDeck`, `getTargetPath`, `actUpload`, `actDownload`, `uploadFinished`.
- `servatrice/src/serversocketinterface.cpp`: `cmdDeckUpload` (path vs deck_id branch), `cmdDeckNewDir`.
- `cockatrice/src/interface/widgets/tabs/abstract_tab_deck_editor.cpp`: `actSaveDeck`, `saveDeckRemoteFinished`,
  `actPrintDeck`, `actLoadDeckFromWebsite`, `exportToDecklistWebsite`, `actAnalyzeDeck*`.
- `cockatrice/src/interface/widgets/deck_editor/deck_state_manager.cpp`, `deck_list_history_manager_widget.cpp`;
  `libcockatrice_deck_list/.../deck_list_history_manager.cpp`.
- `libcockatrice_models/.../deck_list_model.cpp` (`isCardQuantityLegalForFormat`),
  `libcockatrice_card/.../format/format_legality_rules.cpp`, `cockatrice_xml_4.cpp` (format parsing),
  `cockatrice/src/interface/widgets/deck_editor/deck_list_style_proxy.cpp`.
- `deck_editor_deck_dock_widget.cpp` (banner combo, tags), `deck_preview_tag_dialog.cpp`,
  `visual_deck_storage_settings.cpp` (default tags), `libcockatrice_deck_list/.../deck_list.cpp` (metadata XML).
- `visual_deck_editor_sample_hand_widget.cpp`, `cards_display_settings.cpp` (`sampleHandSize` = 7).
- `menus/deck_editor_menu.cpp`, `deck_loader.cpp` (`exportDeckToDecklist`, `printDeckList`),
  `deck_stats_interface.cpp`, `tapped_out_interface.cpp`, `parsers/deck_link_to_api_transformer.cpp`,
  `dlg_load_deck_from_website.cpp`.

## Online integrations: what works from a browser

Checked with `curl -H "Origin: https://webatrice.example"` on 2026-10-03.

| Integration | Desktop | Web | Status |
|---|---|---|---|
| Load: Archidekt | GET `archidekt.com/api/decks/<id>/?format=json` | `Access-Control-Allow-Origin: http://localhost:3000` (fixed), so a web page can't read it. Opens the deck page; the user copies from its Export and pastes into Import. | Copy/paste handoff |
| Load: Moxfield | GET `api.moxfield.com/v2/decks/all/<id>/` | 200, no CORS headers. Opens the deck page; copy/paste. | Copy/paste handoff |
| Load: Deckstats | GET `…?include_comments=1&export_mtgarena=1` | No CORS headers. Opens that same text export in a tab; copy/paste. | Copy/paste handoff |
| Load: TappedOut | GET `…/?fmt=txt` | Cloudflare challenge (`cf-mitigated: challenge`) and no CORS. Opens the text export in a tab; copy/paste. | Copy/paste handoff |
| decklist.org / decklist.xyz | Opens `https://www.<site>/?deckmain=…&deckside=…` | Same URL in a new tab; an empty deck can't be sent. | Works (same as desktop) |
| deckstats.net analyze | POST `deck`, `decktitle` to `/index.php`, then scrapes `og:url` | Same form POSTed into a new tab, which shows deckstats' answer directly. | Works (no scrape needed) |
| tappedout.net analyze | POST `name`, `mainboard`, `sideboard` to `/mtg-decks/paste/`, then follows the 302 | Same form POSTed into a new tab, where the browser follows the redirect. TappedOut puts a Cloudflare check in front, which a real browser normally passes. | Works, not verified live |
| Print | `QPrintPreviewDialog` | Hidden frame + the browser's print dialog (which has its own preview); same layout. | Works |

None of these was submitted to the live sites from a browser in this run. Submitting forms to third-party sites
needs the user's go-ahead. The URLs and form fields are pinned by unit specs against desktop's code.

## Testing

Run from the worktree root (memory-capped per the brief).

| Gate | Result |
|---|---|
| `npm run typecheck` | 5/5 tasks pass |
| `npm run lint` | 3/3 tasks pass, 0 problems |
| `npm test -- -- --maxWorkers=2` | sockatrice 609, datatrice 1091, webatrice 1714 (246 files): all pass |
| `npm run test:integration -- -- --maxWorkers=2` | sockatrice 146, datatrice 124, webatrice 167 pass + 2 skipped (pre-existing skips) |
| `npm run test:e2e -w @cockatrice/webatrice` (under the e2e lock) | 21/21 pass (chromium, firefox, webkit), including the new decks spec |

New and changed coverage:

- **Sockatrice.** `deckUpdate` simple-spec entries, plus `deckUpdate.presence.spec.ts`: `path` is never on the wire
  for an update, and is present for a root `deckUpload`.
- **Datatrice.** `deckUpdated` / `deckUpdateFailed` actions, the reducer (replace by id inside folders; unknown id;
  no tree item), and the `SessionResponseImpl` mappings.
- **Webatrice unit.** Pure modules: `deckHistory`, `deckLegality`, `deckTags`, `deckFolders`, `sampleHand`,
  `deckServices`, `deckPersistence`, `browserHandoff`, plus `cardCatalog` legalities. Hooks: `useDeckHistory`,
  `useDeckLegality`, `useSampleHand` (via the panel), `useDeckFileDownloads`, and `useDeckAutosave` (rewritten
  against the real store). `useDeckEditor` and `useDeckList` gain undo/redo, banner/tags and folder/move cases.
  Each new component has a spec.
- **Webatrice integration.**
  - `deck-editor.spec.tsx`: no upload when nothing changed; undo/redo from the buttons, the history list and
    Ctrl+Z/Ctrl+Y with autosave following; banner/tags round trip with unknown `<tags>` children kept; legality
    per row and on format change; sample hand.
  - `decks.spec.tsx`: the flattened-list characterization now pins the folder behaviour. New specs cover folder
    navigation, `deckNewDir`, `deckDelDir`, create-into-folder, and move (download → upload to path → delete).
- **E2E.** New `e2e/specs/decks.spec.ts` against the docker Servatrice: create a folder, create a deck in it, save
  a rename and its undo, keyboard undo/redo of the format, move the deck to the root, delete the folder.

## Notes for reviewers

- **Move is new on the web side.** Desktop has no remote move. It is built from desktop's own commands: download,
  `deckUpload` into the target path, then `deckDel` of the original once the copy is acknowledged. The deck gets a
  new id. If the upload fails, the original stays; Sockatrice's `deckUpload` has no failure callback to report it.
- **Folder downloads are flat files.** Desktop writes `deck_<id>.cod` into a local folder tree. A browser saves
  flat files, so names are `<subfolders>-<deck>.cod`, and several downloads may trigger the browser's
  "multiple downloads" prompt.
- **Legality differences from desktop, on purpose.**
  - A card with no legality data, or not found, is "couldn't be checked" instead of red. Many web users have no
    local card DB, and the matrix asks to keep unknown apart from illegal.
  - A custom format that nobody labels is "Legality can't be checked". An empty deck shows no legality line.
  - Desktop's `maxAllowedForLegality` returns -1 both for an unlisted label and for an `unlimited` count, so
    desktop paints unlimited cards red. Here `unlimited` is legal.
  - Like desktop, each row is checked against its own quantity, so main and side are not summed.
- **Legality data freshness.** Scryfall lookups cached before this change have no `legalities`. Those cards show as
  unchecked until the cache entry is refreshed. Format `exceptions` are parsed on the next cards.xml import.
- **Sample hand.**
  - A designated commander is left out, since it starts in the command zone; desktop has no commander concept.
  - Mana values sort numerically. Desktop compares the text cmc, which puts 10 before 2.
- **History does not survive leaving the editor.** The deck itself is cached, but history is per mount. Desktop
  keeps it per tab.
- **Tag suggestions** are desktop's default list plus the deck's own tags. Tags from other decks aren't offered,
  because the editor doesn't load other decks.
- **Banner and tags are editable only in the editor.** My Decks shows them but can't edit them; desktop's visual
  deck storage can. Doing that would need a download and re-upload from the list.
- **API change.** `ISessionResponse` gains two required members, `updateServerDeck` and `updateServerDeckFailed`
  (Sockatrice minor). `deckUpdate` reports the save even when a server omits `new_file`.
- **Housekeeping.** The format picker gained `aria-label="Format"` because the sidebar now has several selects.
  `flattenDeckTree` was removed (no callers).

🤖 Generated with [Claude Code](https://claude.com/claude-code)
