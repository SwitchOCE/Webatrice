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
  - Move deck to another folder: a copy that keeps the deck's visibility and color identity, then a delete of the
    original only once the copy is confirmed (see notes).
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
  - `<bannerCard providerId>` now round-trips, and desktop's `<playmatCard>` (with its margin/offset/zoom
    attributes) is kept verbatim in its desktop position.
  - Editing is editor-only; desktop's visual deck storage can also edit them, so GAME-006 is **Partial**.
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
  - Each save sends the deck's color identity, computed like desktop's `getDeckColorIdentity`, because 3.1
    servers overwrite the stored value on every update.

## Parity rows closed

GAME-002, GAME-004, GAME-005, GAME-007, GAME-009 (`Webatrice/docs/cockatrice-parity-matrix.md`).
GAME-006 is advanced but stays **Partial**: banner, tags and playmat round-trip and banner/tags are editable in the
editor, but not from the storage view.

## Desktop reference

- `cockatrice/src/interface/widgets/tabs/tab_deck_storage.cpp`: `actNewFolder`, `actDeleteRemoteDeck`,
  `deleteRemoteDeck`, `getTargetPath`, `actUpload`, `actDownload`, `uploadFinished`.
- `servatrice/src/serversocketinterface.cpp`: `cmdDeckUpload` (path vs deck_id branch; the update branch writes
  `color_identity` every time; "Unnamed deck" for an empty name), `cmdDeckNewDir`, `cmdDeckShareCreate` /
  `makeShareItemFromDeck` (share items hold a snapshot of the deck).
- `cockatrice/src/interface/widgets/cards/additional_info/deck_color_identity.cpp` (`getDeckColorIdentity`).
- `cockatrice/src/interface/widgets/tabs/abstract_tab_deck_editor.cpp`: `actSaveDeck`, `saveDeckRemoteFinished`,
  `actPrintDeck`, `actLoadDeckFromWebsite`, `exportToDecklistWebsite`, `actAnalyzeDeck*`.
- `cockatrice/src/interface/widgets/deck_editor/deck_state_manager.cpp`, `deck_list_history_manager_widget.cpp`;
  `libcockatrice_deck_list/.../deck_list_history_manager.cpp`.
- `libcockatrice_models/.../deck_list_model.cpp` (`isCardQuantityLegalForFormat`),
  `libcockatrice_card/.../format/format_legality_rules.cpp`, `cockatrice_xml_4.cpp` (format parsing),
  `cockatrice/src/interface/widgets/deck_editor/deck_list_style_proxy.cpp`.
- `deck_editor_deck_dock_widget.cpp` (banner combo, tags), `deck_preview_tag_dialog.cpp`,
  `visual_deck_storage_settings.cpp` (default tags), `libcockatrice_deck_list/.../deck_list.cpp` (metadata XML,
  `<playmatCard>` at :124-133).
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

Full gate on the final tip `fc157b6` (2026-10-03, cloud run f0918; this is the only current gate table, the older
ones are gone):

| Gate | Result |
|---|---|
| `npx turbo run typecheck --concurrency=1` | 5/5 tasks pass; every one of the 30 commits in `ba8a091..fc157b6` (09's review fixes and all of 18) typechecks |
| `npm run lint` | 3/3 tasks pass, 0 problems |
| `npm test -- -- --maxWorkers=2` | sockatrice 782 (40 files), datatrice 1204 (29 files), webatrice 2060 (285 files): all pass |
| `npm run test:integration -- -- --maxWorkers=2` | sockatrice 166 (19), datatrice 136 (9), webatrice 196 pass + 2 skipped (39 files; pre-existing game `describe.skip`) |
| `npm run test:e2e -w @cockatrice/sockatrice` | 5/5 pass (4 files) |
| webatrice e2e (Playwright 1.60 container, docker Servatrice 3.0.0) | 36/39 pass, including the decks spec (folders, move to root, undo/redo, autosave) in chromium, firefox and webkit. The 3 failures are `staff-tools` "an admin publishes a new server message" in all three browsers: the spec shells out to `docker compose exec mysql` (`spawnSync docker ENOENT`), and the Playwright container has no docker CLI. Environmental and unrelated to decks; it needs the host-run e2e. |

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


## Review response (rv9)

Rebased onto the fixed 09 (`claude/parity-09-refactor-decks` `a3073b8`). Rebase conflicts: `deckPersistence.ts`
(18's `deckUpdate` version kept), `useDeckList` (09's connection-guard return value merged into 18's folder-aware
uploads), the Spellbook spec (18's commander cases plus 09's "missing `included` is malformed"), and the consent
commit (ported onto 09's translated, focus-keeping `BracketSection`; `writeBracketLookupsAllowed` is now exported
from the feature barrel). Two fixups were folded into the commits they repair so every commit typechecks: the folder
and move dialogs pass `titleId` to the 09 frame (`DeleteFolderDialog` via its new `role="alertdialog"` prop) in
`e5aae31`, and the consent integration spec asserts the translated title in `7f617d7`.

| Finding | Response |
|---|---|
| **blocker**: move can delete a deck that was never copied | Fixed (`01357d4`). Answers are matched on folder + stored name, never `pending[0]`; `DECK_UPLOAD_FAILED` is handled (drops the oldest entry for that folder, shows the error); the original is deleted only on a matched answer. Specs: failed copy then a foreign answer, nameless import matched as "Unnamed deck", unmatched answers. The PR note claiming Sockatrice had no failure callback was wrong and is corrected. |
| major: failed `deckDownload` leaves `pendingMovesRef` set | Fixed (`01357d4`). `DECK_DOWNLOAD_FAILED` for a pending move drops it and reports; spec shows a later download no longer runs it. |
| major: autosave blanks `color_identity` on 3.1 | Fixed (`4d722b4`). `deckUpdate` gains optional `isPublic`/`colorIdentity`; the autosave sends `deckColorIdentity(cards)` (desktop's `getDeckColorIdentity`: union of main+side card colors, WUBRG). Presence spec pins the identity on the wire and visibility unset. |
| major: move loses visibility and breaks share links | Visibility fixed (`01357d4`): `FlatDeck` carries `isPublic`/`colorIdentity` and the move upload sends both. Servatrice has no move command, so the id still changes. **Share links do not break**: shares hold a materialized copy of the deck (`makeShareItemFromDeck`, `deck_share_item.content`), so the review's premise doesn't hold at `add65caa`; the dialog now says the id changes and share links keep working. |
| major: stale bracket after a zone move | Fixed (`c8c74d7`). The fingerprint marks sideboard and commander entries; plain main-deck entries keep the old form so existing caches for such decks stay valid. Specs at the fingerprint and hook level. |
| major: GAME-006 claimed closed but `<playmatCard>` dropped | `<playmatCard>` now round-trips verbatim next to `<bannerCard>` (`5263860`), with codec and save specs. GAME-006 is re-scoped to **Partial** (no storage-view editing). |
| minors and nits not listed in the task (autosave flush after unmount, `deckUpdated` merge, `updateServerDeck` naming, rhf+zod forms, `partial` legality status, `PlainCardList` legality, stale-cache write without consent, e2e anchor, sample-hand input, signature derivation, `matchType` default, dead data, set-code case, `revokeObjectURL`, squashing fix-up commits, splitting dead46c/a7b9684) | Not changed in this run; the task scoped the fixes to the blocker and the five majors. Not renaming `updateServerDeck*` also keeps 18's API stable for w23d. The fix-up squash was not done: `4361b36` edits a changeset that only exists from `db54a62`, so folding it into `ccd4ab2` would not apply cleanly. |

## Notes for reviewers

- **Move is new on the web side.** Desktop has no remote move, and Servatrice has no move or rename command
  (`session_commands.proto` at `add65caa`: upload, download, del, new/del dir, visibility, share). So move is built
  from desktop's own commands: download, `deckUpload` into the target path, then `deckDel` of the original.
  - The original is deleted only after an upload answer with the target folder **and** the stored name (the raw
    `<deckname>`, or "Unnamed deck" as `cmdDeckUpload` stores an empty one). An answer that matches nothing pending
    settles nothing. `DECK_UPLOAD_FAILED` drops the oldest upload waiting on that folder (a session's commands are
    answered in order, and the deck list is the only `deckUpload` caller in the app) and shows the error; the
    original stays. A failed download for a move drops the move and shows the error.
  - The copy gets a **new deck id**. It keeps the deck's `is_public` and stored `color_identity` (passed on the
    upload). **Share links keep working**: `cmdDeckShareCreate` materializes each deck's content into
    `deck_share_item` at share time (`makeShareItemFromDeck`; schema comment "Content is materialized at share
    time"), so a share never references the live `deck_id`. What does change with the id: an editor tab still open
    on the old id, and anyone holding the old id for `deckDownloadPublic`. The move dialog says the id changes and
    that share links keep working.
  - If the hook unmounts between upload and answer, the answer is not seen: the copy exists and the original is
    kept (a duplicate, never a loss).
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
  (Sockatrice minor, additive). `deckUpdate(deckId, deckList, isPublic?, colorIdentity?)`: the two trailing
  parameters are optional, mirroring `deckUpload`. `deckUpdate` reports the save even when a server omits
  `new_file`. In webatrice, `FlatDeck` gains optional `isPublic`/`colorIdentity`, `UseDeckList` gains
  `storageError`/`dismissStorageError`, `createDeck`/`importDeck` return whether they sent, and `DeckDialogFrame`
  requires `titleId` (from the 09 review).
- **Housekeeping.** The format picker gained `aria-label="Format"` because the sidebar now has several selects.
  `flattenDeckTree` was removed (no callers).

## Follow-ups

Four follow-up commits from the review of the series (a fifth, an i18n rollup regeneration, became empty on the
rebase and was dropped):

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


🤖 Generated with [Claude Code](https://claude.com/claude-code)
