# feat(webatrice): card database management — sources, reload, Manage sets, custom tokens and picture URL templates

> **Stacks on parity/21-appearance-i18n-diag** (`4156694`; below it #19 settings → #11 → #10 → #04 → #12 → #03 → #02 → #01). Review and merge after #21. The replays branch (#15), which takes Dexie version 5, lands separately; this branch takes version 7.

## Summary

- **Sources and reload (LONG-028).** Every imported file (cards.xml, tokens.xml, spoiler.xml, custom set XML, editor tokens) is stored as a `cardSources` row. The `cards` / `sets` / `tokens` / `formats` / `info` tables are now rebuilt from all sources in desktop's load order (`CardDatabaseLoader::doLoadCardDatabases`) inside one Dexie transaction. Merging follows `CardDatabase::addCard`: the first definition of a card wins and later files only add printings. Re-importing a file replaces the source of the same kind. Custom sets can be added (desktop's "Add custom sets/cards", any `.xml`; `spoiler.xml` keeps its special case) and removed. "Reload card database" re-parses and re-derives everything. The rebuild reads the stored sources, parses, merges and writes inside that one transaction, so a malformed file leaves the previous database untouched and two quick changes cannot overwrite each other's sources. Each source's XML or records live in a separate `cardSourcePayloads` row, so listing sources reads only metadata. The new "Loaded data" tab lists each file in load order with counts, origin (file / URL / editor / earlier import), MTGJSON version and import time.
- **Manage sets (LONG-030).** Port of `WndSets` / `SetsModel`: enable/disable per set, all, or selected; search across code, name, type and date; top/up/down/bottom; Default order (`CardSetList::defaultSort`); column sort with desktop's note and "Use the current sorting as the set priority instead"; Save/Cancel (`SetsModel::save` writes sort keys 1..n). Preferences live in a new `setPreferences` table keyed by set code, apart from imported `sets`, so re-imports never reset them. First run enables everything (`guessSortKeys` + `enableAll`). Sets found later raise desktop's "New sets found" question (Yes / Yes, always enable / No / View sets), with `alwaysEnableNewSets` persisted.
- **Effect on lookup and art.** The `SetPriorityComparator` order (enabled first, then sort key) now drives two things. First, the printing order in `features/decks/cardLookup.ts`, so the deck editor's default printing follows Manage sets; its session cache is dropped when preferences change. Second, image resolution: `services/cardDatabase/resolveCardImageUrls` mirrors `CardPictureToLoad`. For each printing in priority order (the preferred printing first) it tries the printing's own `picurl`, then each picture URL template that resolves, and finally the Scryfall by-name fallback. `components/Card` and `components/Token` try those URLs in turn and move to the next one on a load error, which is the browser version of desktop's on-demand download.
- **Picture URL templates (LONG-029).** An ordered list of templates is stored in `cardDataSettings`. It starts from desktop's `DEFAULT_DOWNLOAD_URLS`, and `transformUrl` is ported (`!sflang!` is always `en`, as Webatrice has no card-language setting yet): `!name!`, `!corrected_name!`, `!setcode!`, `!setname!`, `!sflang!`, `!prop:x!`, `!set:x!`, the `_substr_` / `_fill_with_` suffixes, and `QUrl::toPercentEncoding`. The editor lives where desktop puts it, **Settings › Card Sources › URL Download Priority**, registered in #19's sections registry. It supports Add New URL, Edit URL, Remove URL, move up/down and Reset Download URLs, and saves each change immediately like desktop.
- **Storage (LONG-015 follow-through).** #21's Storage page now counts the three new tables (loaded card files, set preferences, picture download settings). "Delete card data" also clears `cardSources` and their payloads; otherwise the next "Reload card database" would rebuild the deleted cards from them. It keeps the token editor's `user-tokens` source and leaves those tokens loaded (desktop never deletes `customsets/TK.xml`), and keeps set preferences and download URLs, as desktop keeps them in its settings. After the clear the card-data preferences are reloaded, which also drops the deck editor's lookup cache (the follow-up #21 noted).
- **Upstream updates (LONG-029).** Tokens and spoilers are fetched directly from the URLs Oracle and `SpoilerBackgroundUpdater` use. The spoiler check mirrors desktop: a 404 on `SpoilerSeasonEnabled` drops `spoiler.xml`; otherwise it downloads `spoiler.xml` and reloads only if the file changed. Downloads replace a source only after the XML parses. Offline and HTTP errors are reported and change nothing.
- **Custom tokens (LONG-028/030).** Port of `DlgEditTokens`: add a token (rejected if any card or token already uses the name, with desktop's message), edit color / P/T / annotation, remove, and export as `TK.xml`. Editor tokens are their own source in set `TK` ("Dummy set containing tokens"), loaded last; TK is recorded as an enabled, known set, so it never triggers "New sets found".
- **Keyboard.** Manage sets is a focusable, multi-selectable grid (`aria-activedescendant`, since rows are virtualized): arrows/Home/End/PageUp/PageDown move and select, Shift extends, Ctrl moves without selecting, Space/Enter select (Ctrl toggles), Ctrl+A selects every visible set. The token list and the URL template list use a roving tabindex: arrows move focus, Space/Enter select. The dialog's tabs carry `id`/`aria-controls` and the content is a labelled `tabpanel`.

### CORS check (curl -I with `Origin: http://localhost:3000`)

| URL | Result |
|---|---|
| `raw.githubusercontent.com/Cockatrice/Magic-Token/master/tokens.xml` | 200, `Access-Control-Allow-Origin: *` → fetched in-browser |
| `raw.githubusercontent.com/Cockatrice/Magic-Spoiler/files/spoiler.xml` | 200, `*` → fetched |
| `raw.githubusercontent.com/Cockatrice/Magic-Spoiler/files/SpoilerSeasonEnabled` | 200, `*` → fetched |
| `www.mtgjson.com/api/v5/Meta.json` | 200, `*` → fetched (version check) |
| `www.mtgjson.com/api/v5/AllPrintings.json.xz` | 200, `*`, **98 MB** compressed |
| `cards.scryfall.io/...` (picture template) | `*` |
| `gatherer.wizards.com/Handlers/Image.ashx` | 308 to `gatherer-static…webp`; used only as an `<img>` source, so CORS does not apply |

CORS would allow the card database itself to be fetched. However, Oracle builds `cards.xml` from MTGJSON AllPrintings: 98 MB compressed and several hundred MB of JSON, which would have to be decompressed and converted by a port of `oracleimporter.cpp`. That is not practical in a browser tab. **The cards.xml path therefore stays file-pick.** "Check for card updates" compares MTGJSON's `Meta.json` version with the imported `<sourceVersion>` and, when a newer build exists, tells the user to run Oracle and import the new `cards.xml`.

### Entry points

- `CardImportDialog` (`@app/feature-widgets/card-import`) is still the LeftNav "Import Cards" entry. It is now a tabbed Card Database dialog (Import cards / Loaded data / Manage sets / Custom tokens) and takes a new optional `initialTab?: CardDatabaseTab` prop.
- `CardSourcesSettings` (same widget) is the Card Sources section's block control (`features/settings/sections/cardSources.ts`). It takes the row's `labelId` / `describedBy`, so the Settings page supplies its heading and description. The pre-rebase "Card sources" dialog tab is gone: desktop has the editor only in Settings.

## Parity rows closed

- LONG-028: database reload, custom set/card/token ingestion and management, data summary, transactional import.
- LONG-029: token/spoiler update from upstream; card-database update check (download stays file-pick, see above); ordered picture URL templates with on-demand fallback, edited in Settings › Card Sources.
- LONG-030: Manage sets (enable/disable, priority, search, default order), preferred art, custom token editor and export.

## Desktop reference

- `cockatrice/src/interface/widgets/dialogs/dlg_manage_sets.cpp`, `libcockatrice_models/.../card_set/card_sets_model.cpp`
- `libcockatrice_card/.../set/card_set_list.cpp`, `card_set_comparator.h`, `card_set.h/.cpp`; `libcockatrice_interfaces/.../interface_card_set_priority_controller.h`
- `libcockatrice_card/.../database/card_database.cpp` (`addCard`, `checkUnknownSets`), `card_database_loader.cpp` (load order, `saveCustomTokensToFile`), `parser/cockatrice_xml_4.cpp`
- `cockatrice/src/interface/widgets/dialogs/dlg_edit_tokens.cpp`, `libcockatrice_models/.../token/token_edit_model.cpp`
- `cockatrice/src/interface/window_main.cpp` (Card Database menu, `actAddCustomSet`, "New sets found")
- `cockatrice/src/interface/card_picture_loader/card_picture_to_load.cpp` (`transformUrl`, `populateSetUrls`, `extractSetsSorted`)
- `libcockatrice_settings/.../download_settings.cpp`, `cockatrice/src/interface/widgets/settings_page/deck_editor_settings_page.cpp` (the Card Sources page and its URL Download Priority group)
- `cockatrice/src/interface/widgets/settings_page/storage_settings_page.cpp` (scope of the Storage page, via #21)
- `cockatrice/src/client/network/update/card_spoiler/spoiler_background_updater.cpp`, `oracle/src/pages.cpp`, `oracle/src/oracleimporter.cpp` (TK set)

## Testing

All commands were run from the repo root at `ca5ef66`, after `git submodule update --init && npm ci`.

- `npx turbo run typecheck --concurrency=1`: 5/5 tasks pass. I also ran the Webatrice typecheck on every commit of the rewritten range, and each one passes.
- `npm run lint`: 3/3 tasks pass.
- `npm test -- -- --maxWorkers=2`: Sockatrice 763 passed. Datatrice 1176 passed. Webatrice 238 files passed and 2 were skipped; 1776 tests passed and 2 were skipped. Both skips were already there.
- `npm run test:integration -- -- --maxWorkers=2`: Sockatrice 159 passed. Datatrice 132 passed. Webatrice 38 files passed and 2 were skipped; 181 tests passed and 2 were skipped. Both skips were already there.
- I did not run e2e in the review round, because no server flow changed. The previous round's e2e result is unchanged: 25 passed and 5 failed, and all 5 failures are the known Scryfall `ERR_CERT_AUTHORITY_INVALID` errors in the container, which also happen on the base.
- New specs in the review round. Each one fails without its fix.
  - **Migration followed by rebuilds (real IndexedDB, the app's own database rebuilt as a v6 install).** `integration/.../card-database.spec.ts` covers six cases:
    - A reload keeps every migrated card, token and spoiler, and a second reload reads the stored payload.
    - Importing only cards.xml takes over its cards and keeps the migrated tokens and spoilers through a reload.
    - Update tokens replaces a migrated token.
    - Importing cards, tokens and spoiler again drops the legacy source.
    - Removing legacy keeps the new imports.
    - Editor tokens are not folded into legacy.
  - The migration specs now assert that the upgrade writes only a marker and no payload. The fresh-database case could not fail, so it was replaced by an install that never imported cards.
  - TK becomes a known set, and its long name is refreshed, so no "New sets found" prompt appears.
  - `storage.spec` (real IndexedDB): Delete card data keeps editor tokens loaded, and they survive a reload.
  - `listKeyboard.spec` covers the navigation keys and the roving hook. There are keyboard cases in `ManageSets.spec` (arrows, Shift, Ctrl, Space/Enter, Ctrl+A, and the checkbox keys left alone), `EditTokens.spec` and `CardSourcesSettings.spec`. `useManageSets.spec` covers `selectAll`.
  - `CardImportDialog.spec` checks the tab/tabpanel wiring. `EditTokens.spec` checks that the anchor is attached and the URL is revoked a task later. `LocalOracleImportService.spec` checks that the parsed records are handed on. `CardDatabaseOverview.spec` checks that legacy can be removed. `ManageSets.spec` checks the keyed error alert.

## Notes for reviewers

- **Dexie v7 migration.** Adds the `cardSources` (`id`), `cardSourcePayloads` (`id`), `setPreferences` (`code`) and `cardDataSettings` (`id`) tables, all additive with no primary-key changes. Version 5 is the replays cache (#15) and version 6 #19's settings row; #21 added no Dexie version. The upgrade copies no cards: it counts the existing rows and writes a marker-only `legacy` source (counts and info), and seeds set preferences the way desktop's first run does. Until the first rebuild the card tables *are* the legacy records; that rebuild reads them back (minus editor tokens) and stores them as legacy's payload in the same rebuild transaction, so a failure aborts only that rebuild, never the upgrade.
- **Legacy source semantics.** Pre-v7 installs could import only cards.xml, tokens.xml and spoiler.xml, all into the same tables, so the legacy rows cannot be split by file (a spoiler card looks like any other card). Legacy therefore loads *after* main, tokens and spoiler: a re-imported file takes over every card or token it defines (so "Update tokens" now replaces a migrated token) and the rest is kept. It is dropped automatically once all three files have been imported again, and it can be removed from the Loaded data tab. A card removed upstream can linger from legacy until then, which is the safe side of the trade.
- **One `Stores` enum.** Before the rebase this branch declared a second, complete `Stores` enum in its schema file. The three new members now sit in the existing enum in `v2.schema.ts` (one per line, tagged "Version 7"), which `@app/services` already exports and #21's `StorageService` uses.
- **Card Sources has no "Restore defaults".** The templates live in `cardDataSettings`, not on #19's settings row, so `preferenceKeysOf` finds nothing to reset and the page shows no button. "Reset Download URLs" is desktop's own reset. Desktop's "Download card pictures on the fly" has no switch here: a browser always loads images on demand. The Spoilers group (auto-download, location, Update spoilers) stays in the Loaded data tab; see follow-ups.
- **Theme tokens.** `CardDatabase.css` and `CardImportForm.css` now use #21's tokens (`--border-*`, `--accent-primary`, `--bg-elevated`, `--text-secondary`, `--status-danger`). This clears #21's follow-up about light-only colours in `CardImportForm.css`. The widget's error lines became `.cardDatabase-error` with `role="alert"`; they used an unstyled `error` class before.
- **Storage.** Sources keep their raw XML (in `cardSourcePayloads`), so a reload re-parses with the current parser, the same way desktop re-reads its files. As a result a cards.xml is stored twice: once raw and once as derived rows. An import parses each file once (the preview's records are handed to `createSource`), and parsed sources are cached for the session so adding a custom set doesn't re-parse cards.xml.
- **Deliberate differences from desktop:**
  - Top/Bottom move the selection and keep everything else's relative order. Desktop swaps rows, which scrambles a curated priority list. Up/Down swap with the visible neighbour exactly as desktop does, including when a search filter is active.
  - The token editor lists editor-made tokens only (the `TK` source). Desktop lists every token in set TK, including tokens.xml's, and saves edits as overrides that its first-wins merge then ignores.
  - Desktop drops printings of disabled sets while parsing. Here they stay stored and are just ranked last, so toggling a set needs no reload.
  - Not ported: "Include cards rebalanced for Alchemy" (Webatrice has no rebalanced filtering), the automatic spoiler download on launch (would touch AppShell; the button is manual), and per-host download rate limits (the browser loads images through `<img>`).
- **Image resolver scope.** Card art in the deck editor, `components/Card` and `components/Token` now goes through the templates. In-game cards (`features/game/hooks/useScryfallCard`) still resolve from the server's provider id and name only, because they have no cards.xml printing at hand. Routing them through Dexie is a follow-up.
- `CockatriceXmlParser` stores leaf text via `innerHTML`, so entity-escaped text stays escaped. The new writer escapes editor input. I left the parser alone rather than change stored card text in this PR.
- The `setupTests.ts` Dexie mock gained `transaction`, `clear`, `bulkDelete` and `count` (additive).
- **Follow-ups:** the desktop Card Sources › Spoilers group in Settings (needs the update service outside the dialog); in-game card art through Dexie (`useScryfallCard`); the deck editor's per-printing `imageUri` is still the first resolved candidate, so it should carry the full candidate list for `useImageCandidates` (see Review response); a card-language setting for `!sflang!`.

## Review response (rv6, PR 20)

- **major: legacy data loss.** Fixed. Legacy now loads after main, tokens and spoiler. A new cards.xml only takes over the cards it defines, and Update tokens wins over migrated tokens. Legacy is dropped only when all three files have been imported again, or when the user removes it. The integration specs run real `reload` and `addSources` calls after the real upgrade. Legacy rows cannot be split by kind, because pre-v7 spoiler cards are indistinguishable from main cards, so I used the ordering approach instead.
- **major: one huge record in the versionchange.** Fixed. The upgrade counts the rows and writes a marker only. The first rebuild reads the legacy records back from the live tables, inside its own transaction. Source payloads moved to a new `cardSourcePayloads` table, so `listSources` and the rebuild's source scan no longer load the XML or the records.
- **major: untested rebuild claim / unfailable fresh case.** Fixed (see Testing).
- **major: Delete card data deletes user tokens.** Fixed. The `user-tokens` source and payload are kept and their tokens and TK set stay loaded. The doc comment and the confirm text now say so.
- **major: keyboard (ManageSets, EditTokens, URL editor).** Fixed (see Summary › Keyboard). ManageSets uses `aria-activedescendant` rather than roving focus, because its rows are virtualized and a focused row could unmount.
- **minor: `!sflang!` always `en`.** Documented in the code and in this PR. It will be wired up once a card-language setting exists.
- **minor: deck editor `imageUri` has no fallback.** Not applied here. Exposing the candidate list means changing `PrintingSummary` and every deck-editor image consumer (`hydrate.ts`, the editor's image components) to use `useImageCandidates`, which is beyond a review fix. With the default templates, the first candidate is the same Scryfall-by-uuid URL the deck editor used before this PR. Listed as a follow-up.
- **minor: TK not known / prefs stale.** Fixed. TK is upserted as enabled and known, and the preferences are refreshed.
- **minor: double parse.** Fixed. `ingest` hands its parsed records to `createSource`.
- **minor: raw error text.** Fixed for ManageSets, EditTokens and CardSourcesSettings, which now show keyed messages with the raw text as `{error}`. The overview and CardUpdateService already used keyed messages (`offline`, `httpError`, `failed {error}`).
- **minor: tabs aria.** Fixed.
- **minor: download revoke.** Fixed.
- **minor: red intermediate commits / mismatched messages.** Fixed by rewriting the history:
  - `d0001d5` was folded into `7a4d914`, and `ea071aa` into `42eb084`.
  - The test fix-ups (`05a3323`, `b77ce45` and the spec from `37945e9`) were folded into the test commit.
  - The changeset is now created in the docs commit, and the pre-v5 → pre-v7 comment edits went into the commits that wrote them.
  - The StorageControls spec counts moved into the first commit, which adds the stores. That commit failed typecheck before.
  - `i18n-default.json` is regenerated in each commit.
  - Every commit typechecks, and the final tree matched the fix branch before the last two fixups.
- **nit: reads outside the transaction.** Fixed. `applySources` reads, merges and writes in one `cardDataTransaction`, which now also covers `cardSourcePayloads` and `cardDataSettings`.

## Restack notes (wR1)

- Token editor and picture-URL lists use the shared `useGridRows` (#11); ManageSets keeps aria-activedescendant (virtualized multi-select).
- 20 @2c1abfa dexie Stores/DTOs/types/DexieService: 15's replay tables + 20's v7 card-data tables (additive)
- 20 @f1c6549 StorageService.ts: 20's card-preference stores + 21-restack's replay stores in ALL_STORES
- 20 @3a60393 (grid decision): token editor and picture-URL lists use useGridRows (dropped 20's useRovingOptions + spec; selection now follows the arrows like desktop's list widgets); Manage Sets keeps its aria-activedescendant model (virtualized multi-select grid — useGridRows focuses rows, which would unmount)
- 20 @00dc16a: FeatureDetection.spec's @app/services mock made partial (importOriginal) — the restacked import graph now evaluates mergeCardSources (USER_TOKENS_SOURCE_ID at module load) through the shell barrel
