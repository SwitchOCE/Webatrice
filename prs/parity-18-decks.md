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

## Rebase (w0918r)

Rebased onto the rebased 09 (`claude/parity-09-refactor-decks` `ba8a091`). Decisions:

- **`deckUpdate` failure shape** now matches line A's deck failures: `updateServerDeckFailed?(deckId, responseCode,
  failure?)` and `deckUpdateFailed: CommandFailedPayload & { deckId }`. It is still an optional `ISessionResponse` member,
  and the changeset says so. The session command index and `ISessionResponse` keep one entry per line next to 03's/04's
  deck share/visibility commands.
- **Autosave**: 18's signature-based autosave (`DECK_UPDATED`/`DECK_UPDATE_FAILED`, signature advances only on ack)
  replaces line A's/09's `uploadDeckUpdate` + `onFailed` rollback. It covers the same behaviour (a failed save is
  resent by the next save), so that code and its specs were dropped. 18's "could not be saved" + Retry indicator
  replaces line A's `SaveFailedIndicator`. Its hint moved to `DeckSidebar.saveFailedHint` as the indicator's title, and
  the orphaned `DeckEditor.saveFailed*` keys were removed.
- **Folders**: `useDeckList` keeps line A's `listError` next to 18's folder view. `Decks` shows `DeckListError` while
  loading fails, before the folder bar.
- **e2e**: `e2e/specs/decks.spec.ts` imports `test`/`expect` from `e2e/fixtures/test.ts` (hermetic network). The
  standalone "regenerate the i18n rollup" commit became empty and was dropped, because each step regenerates the rollup.

Gate on the rebased tip `a7b9684`: typecheck 5/5; lint 3/3; unit sockatrice 781, datatrice 1204, webatrice 2038
(285 files); integration sockatrice 166, datatrice 136, webatrice 196 passed + 2 skipped (pre-existing game
`describe.skip`); sockatrice e2e 5/5; webatrice e2e 39/39 (chromium, firefox, webkit).

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
    desktop paints unlimited cards red. That is a desktop bug (evidence under Follow-ups). Here `unlimited` is legal.
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
- **API change.** `ISessionResponse` gains two optional members, `updateServerDeck` and `updateServerDeckFailed`
  (Sockatrice minor, additive). `deckUpdate` reports the save even when a server omits `new_file`.
- **Housekeeping.** The format picker gained `aria-label="Format"` because the sidebar now has several selects.
  `flattenDeckTree` was removed (no callers).

## Follow-ups

Five commits at the tip of this branch, after review of the series. The first,
`chore(webatrice): regenerate the i18n rollup`, only re-orders `src/i18n-default.json` to what `npm run translate`
produces now. The pre-commit hook would otherwise have folded that into the next commit.

- **`fix(sockatrice)`: optional deck update callbacks.** `updateServerDeck` and `updateServerDeckFailed` are now
  optional members of `ISessionResponse`, as the series does elsewhere (#10's `updateInfo` argument,
  `updateConnectionHealth`). `deckUpdate` calls them with `?.`. Existing implementations of the interface still
  compile. A spec pins that a response without them doesn't throw on success or error. The changeset says so.
- **`test(webatrice)`: `unlimited` stays legal; desktop's red is a bug.** At `add65caa`, Cockatrice #6166
  ("Deck format legality checker", BruebachL, 2025-12-13) added all of these:
  - the parser line `c.max = (maxAttr == "unlimited") ? -1 : …` (`cockatrice_xml_4.cpp:133`), and the writer
    turning -1 back into `"unlimited"`;
  - `AllowedCount::max` documented as "4, 1, 0, or -1 for unlimited" (`format_legality_rules.h:20`);
  - in `isCardQuantityLegalForFormat`, `if (maxAllowed == -1) return false;` followed by
    `if (maxAllowed < 0) { // unlimited  return true; }`.

  The second branch can never run, because the only negative value is -1 and the check before it catches that. Later commits touched
  the function (#6425 static helpers, #6460 cleanup, #6535 exception precedence, #6536 `getLegalityProp`), but none
  changed the -1 checks. The intent, a legal
  unlimited card, is written down three times. The red comes from reusing -1 as "label not listed". So
  `unlimited` stays legal here. The reasoning is now in a comment by the check, and a spec separates the two cases.
  The oracle's own imports use only `{4, legal}` / `{1, legal}` and `{0, banned}`, so only hand-written or
  third-party format XML hits this. Worth an upstream desktop issue.
- **`fix(webatrice)`: no sideboard in Commander Spellbook lookups.** Spellbook's `find-my-combos` accepts only
  `main` and `commanders`. Its `DeckSerializer` (`backend/common/serializers.py` in
  SpaceCowMedia/commander-spellbook-backend) has no sideboard field. Its plain-text parser drops `Sideboard`
  and `Maybeboard` sections. The live `/schema/` could not be reached from this sandbox (proxy 403), so the
  source was read instead. The request now sends the main deck in `main` and designated commanders in
  `commanders`, so "must be commander" combos match. Sideboard cards are left out. A deck with nothing in the main
  deck makes no request. The Scryfall lookups (Game Changers, oracle text) still use every card name. They only
  read card text and don't count copies.
- **`feat(webatrice)`: consent for the bracket's third-party calls.** Default **off**, with a first-use prompt
  in the bracket section: "Allow online lookups". The prompt says what goes to Scryfall and what goes to
  Spellbook. Desktop runs no third-party lookup without the user's say. Its one automatic lookup, "Download
  spoilers automatically" (`DownloadSettings::getDownloadSpoilersStatus`), defaults to false. Its deck-site
  services (above) each run from a menu action.
  - The choice is remembered per browser (`localStorage` `decks:bracketOnlineLookups`) and shared live by every
    open deck view. "Turn off online lookups" next to the provenance line withdraws it.
  - Without consent, a saved assessment that matches the deck still shows, with no network. One for an older
    version of the deck is cleared, as a failed analysis already does. The Game Changers search and Spellbook are
    never called; the integration spec asserts both, then opts in and sees the bracket computed and saved.
  - **Seam for #19:** `features/decks/bracketConsent.ts` (`readBracketLookupsAllowed`,
    `writeBracketLookupsAllowed`, `useBracketLookupsConsent`) is the only reader and writer. When the settings
    framework lands, the preference should move into its online services group behind those exports. The prompt
    can stay as the first-use path.
  - Not covered: the editor's card lookup (Scryfall by name for card data and prices) predates this branch and
    isn't a bracket call. It is left as is.

Follow-up testing (from the repo root, after `npm ci` and building sockatrice and datatrice):

| Gate | Result |
|---|---|
| `npx turbo run typecheck --concurrency=1` | 5/5 tasks pass |
| `npm run lint` | 3/3 tasks pass, 0 problems |
| `npm test -- -- --maxWorkers=2` | sockatrice 610, datatrice 1091, webatrice 1728 (247 files): all pass |
| `npm run test:integration -- -- --maxWorkers=2` | sockatrice 146, datatrice 124, webatrice 168 pass + 2 skipped (pre-existing) |
| `npm run test:e2e -w @cockatrice/sockatrice` | 3/3 pass |
| webatrice e2e (Playwright 1.60 container, docker Servatrice 3.0.0) | 16/21 pass, including the decks spec in all three browsers. 5 fail: `app-boots` (chromium, webkit) on `net::ERR_CERT_AUTHORITY_INVALID` (the sandbox's TLS-intercepting proxy, not trusted inside the container), and `bulk-card-actions` (all three) at `cardsOnBoard()` count 0. The same 5 fail the same way on the untouched `parity/18-decks` tip in this sandbox, so neither is from these commits. Worth re-running on a normal network. |

🤖 Generated with [Claude Code](https://claude.com/claude-code)
