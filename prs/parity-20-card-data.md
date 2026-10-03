# feat(webatrice): card database management — sources, reload, Manage sets, custom tokens and picture URL templates

## Summary

- **Sources and reload (LONG-028).** Every imported file (cards.xml, tokens.xml, spoiler.xml, custom set XML, editor tokens) is stored as a `cardSources` row. The `cards` / `sets` / `tokens` / `formats` / `info` tables are now rebuilt from all sources in desktop's load order (`CardDatabaseLoader::doLoadCardDatabases`) inside one Dexie transaction. Merging follows `CardDatabase::addCard`: the first definition of a card wins and later files only add printings. Re-importing a file replaces the source of the same kind. Custom sets can be added (desktop's "Add custom sets/cards", any `.xml`; `spoiler.xml` keeps its special case) and removed. "Reload card database" re-parses and re-derives everything. XML is parsed before the transaction opens, so a malformed file leaves the previous database untouched. The new "Loaded data" tab lists each file in load order with counts, origin (file / URL / editor / earlier import), MTGJSON version and import time.
- **Manage sets (LONG-030).** Port of `WndSets` / `SetsModel`: enable/disable per set, all, or selected; search across code, name, type and date; top/up/down/bottom; Default order (`CardSetList::defaultSort`); column sort with desktop's note and "Use the current sorting as the set priority instead"; Save/Cancel (`SetsModel::save` writes sort keys 1..n). Preferences live in a new `setPreferences` table keyed by set code, apart from imported `sets`, so re-imports never reset them. First run enables everything (`guessSortKeys` + `enableAll`). Sets found later raise desktop's "New sets found" question (Yes / Yes, always enable / No / View sets), with `alwaysEnableNewSets` persisted.
- **Effect on lookup and art.** The `SetPriorityComparator` order (enabled first, then sort key) now drives two things. First, the printing order in `features/decks/cardLookup.ts`, so the deck editor's default printing follows Manage sets; its session cache is dropped when preferences change. Second, image resolution: `services/cardDatabase/resolveCardImageUrls` mirrors `CardPictureToLoad`. For each printing in priority order (the preferred printing first) it tries the printing's own `picurl`, then each picture URL template that resolves, and finally the Scryfall by-name fallback. `components/Card` and `components/Token` try those URLs in turn and move to the next one on a load error, which is the browser version of desktop's on-demand download.
- **Picture URL templates (LONG-029).** An ordered list of templates is stored in `cardDataSettings`. It starts from desktop's `DEFAULT_DOWNLOAD_URLS`, and `transformUrl` is ported exactly: `!name!`, `!corrected_name!`, `!setcode!`, `!setname!`, `!sflang!`, `!prop:x!`, `!set:x!`, the `_substr_` / `_fill_with_` suffixes, and `QUrl::toPercentEncoding`. The editor supports Add New URL, Edit URL, Remove URL, move up/down and Reset Download URLs, and saves each change immediately like desktop.
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

- `CardImportDialog` (`@app/feature-widgets/card-import`) is still the LeftNav "Import Cards" entry. It is now a tabbed Card Database dialog (Import cards / Loaded data / Manage sets / Custom tokens / Card sources) and takes a new optional `initialTab?: CardDatabaseTab` prop.
- **For the sibling Settings PR:** `CardSourcesSettings` is exported from `@app/feature-widgets/card-import`. It is self-contained (loads and saves through Dexie, no props) and can be rendered as the Settings page's "Card Sources" section. To link to the whole dialog instead, use `<CardImportDialog isOpen handleClose={…} initialTab="sources" />`. This PR does not touch `Settings.tsx`.

## Parity rows closed

- LONG-028: database reload, custom set/card/token ingestion and management, data summary, transactional import.
- LONG-029: token/spoiler update from upstream; card-database update check (download stays file-pick, see above); ordered picture URL templates with on-demand fallback.
- LONG-030: Manage sets (enable/disable, priority, search, default order), preferred art, custom token editor and export.

## Desktop reference

- `cockatrice/src/interface/widgets/dialogs/dlg_manage_sets.cpp`, `libcockatrice_models/.../card_set/card_sets_model.cpp`
- `libcockatrice_card/.../set/card_set_list.cpp`, `card_set_comparator.h`, `card_set.h/.cpp`; `libcockatrice_interfaces/.../interface_card_set_priority_controller.h`
- `libcockatrice_card/.../database/card_database.cpp` (`addCard`, `checkUnknownSets`), `card_database_loader.cpp` (load order, `saveCustomTokensToFile`), `parser/cockatrice_xml_4.cpp`
- `cockatrice/src/interface/widgets/dialogs/dlg_edit_tokens.cpp`, `libcockatrice_models/.../token/token_edit_model.cpp`
- `cockatrice/src/interface/window_main.cpp` (Card Database menu, `actAddCustomSet`, "New sets found")
- `cockatrice/src/interface/card_picture_loader/card_picture_to_load.cpp` (`transformUrl`, `populateSetUrls`, `extractSetsSorted`)
- `libcockatrice_settings/.../download_settings.cpp`, `cockatrice/src/interface/widgets/settings_page/deck_editor_settings_page.cpp`
- `cockatrice/src/client/network/update/card_spoiler/spoiler_background_updater.cpp`, `oracle/src/pages.cpp`, `oracle/src/oracleimporter.cpp` (TK set)

## Testing

All commands were run from the worktree at `6f0df13`. Vitest was capped at `--maxWorkers=2` and turbo at `--concurrency=1` because the shared host was short of memory.

- `turbo run typecheck --concurrency=1`: 5/5 tasks successful.
- `turbo run lint --concurrency=1`: 3/3 tasks successful, 0 problems.
- Unit tests:
  - sockatrice: 604 passed.
  - datatrice: 1083 passed.
  - webatrice (`vitest run --maxWorkers=2`): 181 files passed, 2 skipped; 1298 tests passed, 2 skipped.
- Integration tests (`vitest run --config vitest.integration.config.ts --maxWorkers=2`, per package):
  - sockatrice: 16 files, 146 tests passed.
  - datatrice: 8 files, 124 tests passed.
  - webatrice: 34 files passed, 2 skipped; 140 tests passed, 2 skipped.
- New webatrice unit specs:
  - set priority (`CardSetList` / comparator / `checkUnknownSets` ports)
  - URL templating (`transformUrl`, substr/fill, encoding)
  - image candidate resolution
  - v5 migration
  - `CardDataSettingsDTO`
  - source merge and load order
  - XML writer round trip
  - update service (tokens, spoiler season, MTGJSON check, offline/HTTP errors)
  - Manage Sets model and hook
  - custom tokens helpers and hook
  - template editor hook
  - overview hook
  - component specs for ManageSets, EditTokens, CardSourcesSettings, CardDatabaseOverview, CardImportDialog, CardImportForm and Card
  - preferences/candidate hooks
- New integration spec `integration/src/services/dexie/card-database.spec.ts` (real fake-indexeddb):
  - first-run enable
  - merge plus the new-sets prompt
  - custom set removal
  - rollback on a malformed file
  - reload
  - set preference refresh
  - editor tokens
  - a real v4 → v5 schema upgrade
- E2E was not run: the change has no server round trip.

Infrastructure note: a plain `npm test` / `npm run test:integration` through turbo crashed the webatrice task with OOM (exit `-1073740791`) while other agents shared the host. Turbo also rejects a `--maxWorkers` passthrough. The numbers above therefore come from running Vitest per package; no test failed.

## Notes for reviewers

- **Dexie v5 migration.** Adds the `cardSources` (`id`), `setPreferences` (`code`) and `cardDataSettings` (`id`) tables, all additive with no primary-key changes. The upgrade wraps a pre-v5 install's imported rows in a `legacy` source so the first rebuild keeps them. It also seeds set preferences the way desktop's first run does. A newly imported `cards.xml` replaces the legacy source. This is covered by a real-IndexedDB v4→v5 spec.
- **Storage.** Sources keep their raw XML, so a reload re-parses with the current parser, the same way desktop re-reads its files. As a result a cards.xml is stored twice: once raw and once as derived rows. Parsed sources are cached for the session so adding a custom set doesn't re-parse cards.xml twice.
- **Deliberate differences from desktop:**
  - Top/Bottom move the selection and keep everything else's relative order. Desktop swaps rows, which scrambles a curated priority list. Up/Down swap with the visible neighbour exactly as desktop does, including when a search filter is active.
  - The token editor lists editor-made tokens only (the `TK` source). Desktop lists every token in set TK, including tokens.xml's, and saves edits as overrides that its first-wins merge then ignores.
  - Desktop drops printings of disabled sets while parsing. Here they stay stored and are just ranked last, so toggling a set needs no reload.
  - Not ported: "Include cards rebalanced for Alchemy" (Webatrice has no rebalanced filtering), the automatic spoiler download on launch (would touch AppShell; the button is manual), and per-host download rate limits (the browser loads images through `<img>`).
- **Image resolver scope.** Card art in the deck editor, `components/Card` and `components/Token` now goes through the templates. In-game cards (`features/game/hooks/useScryfallCard`) still resolve from the server's provider id and name only, because they have no cards.xml printing at hand. Routing them through Dexie is a follow-up.
- `CockatriceXmlParser` stores leaf text via `innerHTML`, so entity-escaped text stays escaped. The new writer escapes editor input. I left the parser alone rather than change stored card text in this PR.
- The `setupTests.ts` Dexie mock gained `transaction`, `clear`, `bulkDelete` and `count` (additive).
- E2E was not run: nothing here is a server round trip.
