# feat(webatrice): card database management — sources, reload, Manage sets, custom tokens and picture URL templates

> **Stacks on parity/21-appearance-i18n-diag** (`4156694`; below it #19 settings → #11 → #10 → #04 → #12 → #03 → #02 → #01). Review and merge after #21. The replays branch (#15), which takes Dexie version 5, lands separately; this branch takes version 7.

## Summary

- **Sources and reload (LONG-028).** Every imported file (cards.xml, tokens.xml, spoiler.xml, custom set XML, editor tokens) is stored as a `cardSources` row. The `cards` / `sets` / `tokens` / `formats` / `info` tables are now rebuilt from all sources in desktop's load order (`CardDatabaseLoader::doLoadCardDatabases`) inside one Dexie transaction. Merging follows `CardDatabase::addCard`: the first definition of a card wins and later files only add printings. Re-importing a file replaces the source of the same kind. Custom sets can be added (desktop's "Add custom sets/cards", any `.xml`; `spoiler.xml` keeps its special case) and removed. "Reload card database" re-parses and re-derives everything. XML is parsed before the transaction opens, so a malformed file leaves the previous database untouched. The new "Loaded data" tab lists each file in load order with counts, origin (file / URL / editor / earlier import), MTGJSON version and import time.
- **Manage sets (LONG-030).** Port of `WndSets` / `SetsModel`: enable/disable per set, all, or selected; search across code, name, type and date; top/up/down/bottom; Default order (`CardSetList::defaultSort`); column sort with desktop's note and "Use the current sorting as the set priority instead"; Save/Cancel (`SetsModel::save` writes sort keys 1..n). Preferences live in a new `setPreferences` table keyed by set code, apart from imported `sets`, so re-imports never reset them. First run enables everything (`guessSortKeys` + `enableAll`). Sets found later raise desktop's "New sets found" question (Yes / Yes, always enable / No / View sets), with `alwaysEnableNewSets` persisted.
- **Effect on lookup and art.** The `SetPriorityComparator` order (enabled first, then sort key) now drives two things. First, the printing order in `features/decks/cardLookup.ts`, so the deck editor's default printing follows Manage sets; its session cache is dropped when preferences change. Second, image resolution: `services/cardDatabase/resolveCardImageUrls` mirrors `CardPictureToLoad`. For each printing in priority order (the preferred printing first) it tries the printing's own `picurl`, then each picture URL template that resolves, and finally the Scryfall by-name fallback. `components/Card` and `components/Token` try those URLs in turn and move to the next one on a load error, which is the browser version of desktop's on-demand download.
- **Picture URL templates (LONG-029).** An ordered list of templates is stored in `cardDataSettings`. It starts from desktop's `DEFAULT_DOWNLOAD_URLS`, and `transformUrl` is ported exactly: `!name!`, `!corrected_name!`, `!setcode!`, `!setname!`, `!sflang!`, `!prop:x!`, `!set:x!`, the `_substr_` / `_fill_with_` suffixes, and `QUrl::toPercentEncoding`. The editor lives where desktop puts it, **Settings › Card Sources › URL Download Priority**, registered in #19's sections registry. It supports Add New URL, Edit URL, Remove URL, move up/down and Reset Download URLs, and saves each change immediately like desktop.
- **Storage (LONG-015 follow-through).** #21's Storage page now counts the three new tables (loaded card files, set preferences, picture download settings). "Delete card data" also clears `cardSources`; otherwise the next "Reload card database" would rebuild the deleted cards from them. Set preferences and download URLs are kept, as desktop keeps them in its settings. After the clear the card-data preferences are reloaded, which also drops the deck editor's lookup cache (the follow-up #21 noted).
- **Upstream updates (LONG-029).** Tokens and spoilers are fetched directly from the URLs Oracle and `SpoilerBackgroundUpdater` use. The spoiler check mirrors desktop: a 404 on `SpoilerSeasonEnabled` drops `spoiler.xml`; otherwise it downloads `spoiler.xml` and reloads only if the file changed. Downloads replace a source only after the XML parses. Offline and HTTP errors are reported and change nothing.
- **Custom tokens (LONG-028/030).** Port of `DlgEditTokens`: add a token (rejected if any card or token already uses the name, with desktop's message), edit color / P/T / annotation, remove, and export as `TK.xml`. Editor tokens are their own source in set `TK` ("Dummy set containing tokens"), loaded last.

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

All commands were run from the repo root at `0bdd81a`, after `git submodule update --init && npm ci`.

- `npx turbo run typecheck --concurrency=1`: 5/5 tasks pass.
- `npm run lint`: 3/3 tasks pass, 0 problems.
- `npm test -- -- --maxWorkers=2`:
  - Sockatrice: 763 passed.
  - Datatrice: 1176 passed.
  - Webatrice: 237 files passed, 2 skipped; 1761 tests passed, 2 skipped. Both skips were already there.
- `npm run test:integration -- -- --maxWorkers=2`:
  - Sockatrice: 159 passed.
  - Datatrice: 132 passed.
  - Webatrice: 38 files passed, 2 skipped; 173 tests passed, 2 skipped. Both skips were already there.
- Webatrice e2e, run once in `mcr.microsoft.com/playwright:v1.60.0-noble` against the 3.0.0 Servatrice stack (chromium, firefox and webkit): 25 passed, 5 failed. The 5 failures are `app-boots` (chromium, webkit) and `bulk-card-actions` (all three browsers). Each fails with `ERR_CERT_AUTHORITY_INVALID` on Scryfall, because the container does not trust the egress proxy's CA. The same two specs on the base `4156694` give the same 5 failures, so this branch causes none of them. The hermetic e2e fixture branch fixes this.
- Sockatrice e2e: not run, because no Sockatrice or server flow changed.
- New or changed specs in this rebase:
  - **Migration (real IndexedDB):** `integration/src/services/dexie/card-database.spec.ts` covers three cases: v6 → v7 (the settings row comes through unchanged), v4 → v7 through #19's settings step, and a fresh v7 open. `DexieSchemas/v7.schema.spec.ts` is the renamed unit spec.
  - **Settings:** `Settings.spec` covers the Card Sources page: it renders a labelled and described editor and has no "Restore defaults". Search finds the editor. `registry.spec` and `Settings.spec` check the page order including Card Sources.
  - **Storage:** `StorageService.spec` checks that `cardSources` is cleared and set preferences and download settings are kept. `StorageControls.spec` checks the new table rows, that the card-data count includes loaded files, and that preferences are refreshed after a delete. `integration/.../storage.spec.ts` checks real counts and clears across the new tables. It also covers delete then reload: the cards stay gone and the Manage sets choices are kept.
  - **Dialog:** `CardImportDialog.spec` no longer has a sources tab.
- The original branch's specs are unchanged and all pass: set priority, URL templating, image candidates, DTOs, source merge and load order, the XML writer, the update service, Manage sets, custom tokens, the template editor, the overview and component specs.

## Notes for reviewers

- **Dexie v7 migration.** Adds the `cardSources` (`id`), `setPreferences` (`code`) and `cardDataSettings` (`id`) tables, all additive with no primary-key changes. Version 5 is the replays cache (#15) and version 6 #19's settings row; #21 added no Dexie version. The upgrade wraps a pre-v7 install's imported rows in a `legacy` source so the first rebuild keeps them. It also seeds set preferences the way desktop's first run does. A newly imported `cards.xml` replaces the legacy source. Real-IndexedDB specs cover v6→v7 (settings row unchanged), v4→v7 and a fresh v7 open.
- **One `Stores` enum.** Before the rebase this branch declared a second, complete `Stores` enum in its schema file. The three new members now sit in the existing enum in `v2.schema.ts` (one per line, tagged "Version 7"), which `@app/services` already exports and #21's `StorageService` uses.
- **Card Sources has no "Restore defaults".** The templates live in `cardDataSettings`, not on #19's settings row, so `preferenceKeysOf` finds nothing to reset and the page shows no button. "Reset Download URLs" is desktop's own reset. Desktop's "Download card pictures on the fly" has no switch here: a browser always loads images on demand. The Spoilers group (auto-download, location, Update spoilers) stays in the Loaded data tab; see follow-ups.
- **Theme tokens.** `CardDatabase.css` and `CardImportForm.css` now use #21's tokens (`--border-*`, `--accent-primary`, `--bg-elevated`, `--text-secondary`, `--status-danger`). This clears #21's follow-up about light-only colours in `CardImportForm.css`. The widget's error lines became `.cardDatabase-error` with `role="alert"`; they used an unstyled `error` class before.
- **Storage.** Sources keep their raw XML, so a reload re-parses with the current parser, the same way desktop re-reads its files. As a result a cards.xml is stored twice: once raw and once as derived rows. Parsed sources are cached for the session so adding a custom set doesn't re-parse cards.xml twice.
- **Deliberate differences from desktop:**
  - Top/Bottom move the selection and keep everything else's relative order. Desktop swaps rows, which scrambles a curated priority list. Up/Down swap with the visible neighbour exactly as desktop does, including when a search filter is active.
  - The token editor lists editor-made tokens only (the `TK` source). Desktop lists every token in set TK, including tokens.xml's, and saves edits as overrides that its first-wins merge then ignores.
  - Desktop drops printings of disabled sets while parsing. Here they stay stored and are just ranked last, so toggling a set needs no reload.
  - Not ported: "Include cards rebalanced for Alchemy" (Webatrice has no rebalanced filtering), the automatic spoiler download on launch (would touch AppShell; the button is manual), and per-host download rate limits (the browser loads images through `<img>`).
- **Image resolver scope.** Card art in the deck editor, `components/Card` and `components/Token` now goes through the templates. In-game cards (`features/game/hooks/useScryfallCard`) still resolve from the server's provider id and name only, because they have no cards.xml printing at hand. Routing them through Dexie is a follow-up.
- `CockatriceXmlParser` stores leaf text via `innerHTML`, so entity-escaped text stays escaped. The new writer escapes editor input. I left the parser alone rather than change stored card text in this PR.
- The `setupTests.ts` Dexie mock gained `transaction`, `clear`, `bulkDelete` and `count` (additive).
- **Follow-ups:** the desktop Card Sources › Spoilers group in Settings (needs the update service outside the dialog); in-game card art through Dexie (`useScryfallCard`).
