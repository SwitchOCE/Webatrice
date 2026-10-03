# feat(settings): appearance palettes, every UI language, storage controls and a debug log

> **Stacks on parity/19-settings** (`e3a1137`, itself on #11 → #10 → #04 → #12 → #03 → #02 → #01). Rebased from the older #19 tip `55d462c`. Review and merge after #19.

## Summary
- **Appearance (LONG-012).** `tokens.css` now has a light palette next to the dark one, selected by `<html data-theme>`. A new `themeMode` preference offers desktop's "Active theme palette" choices (Light / Dark / System) in a Theme group at the top of Appearance. System follows `prefers-color-scheme` and switches live when the OS changes. `AppThemeProvider` applies the choice two ways:
  - to the design tokens;
  - to a MUI theme built from `services/theme/palettes.ts`, so the colours MUI computes itself (switches, focus rings, `palette.divider`) follow too.

  The mode is mirrored to localStorage and applied before React renders, so the first paint is already right.
- **Hard-coded colour audit.**
  - Status colours are now tokens: `text-danger`, `text-success` and `text-warning` replace `text-red/emerald/yellow-300/400`.
  - A `light:` Tailwind variant covers the decorative hues: chat-log categories, the moderator badge and the info toast.
  - The game dialogs that still used the pre-redo navy (zone view, sideboard, game info, deck select, reveal) or light-only colours now use tokens. In dark mode, the deck-select textarea was white text on `#f7f8fa`, which could not be read.
  - Login fixes: the gradient panel text is now white, and the disabled Login button's label is now visible.
  - Surfaces from the new base (#10/#11/#12/#13) were audited too. The error-boundary and deck-load icons, the known-hosts error border and text, and the private-chat online dot now use status tokens. The log search form's error colour read an undefined `--color-error` and always fell back to the dark red; it now reads `--status-danger`. The account, moderation, admin and user-games dialogs are MUI, and they follow the palette through the MUI theme (`palette.error/success/warning` come from the status tokens), so they need no change.
- **Localization (LONG-016).**
  - `Language` now lists all 12 catalogues in `public/locales`. A spec checks that it matches the folder.
  - The `en-US` vs `en_US` mismatch is fixed. `resolveSupportedLanguage` maps browser tags (`pt-BR`, `de-AT`, `en-GB`, `yue-Hant-HK`) onto catalogue codes, and is used by i18next's detector (`convertDetectedLanguage` + `supportedLngs`).
  - The Account page's headings, add-user buttons and profile/server details are now `Account.*` keys. Before this they stayed in English after a language switch.
  - The language is a persisted `language` preference ('' = follow the browser). It can be set in General › Language or the login/account dropdown, and it applies live through `useApplyLanguagePreference`.
- **Storage (LONG-015).** A new Storage section shows:
  - the `navigator.storage.estimate()` usage against quota;
  - the row count of every Dexie table;
  - persistence status, with a "Keep my data" button (`navigator.storage.persist()`).

  It can also clear the Scryfall cache, and delete the imported card database after a confirmation. Each clear is a single Dexie transaction, and neither touches settings, shortcuts or known hosts.
- **Debug log (LONG-007).** `services/debugLog` follows desktop's `Logger`: a header (client, browser, locale) and a 500-line ring buffer.
  - `installConsoleCapture()` (called in `index.tsx`) wraps `console.*`, which captures every existing logging call in Webatrice, Sockatrice and Datatrice, plus uncaught errors and unhandled rejections. Each wrapper calls the original method first with the same arguments. The dev server ignore-lists the wrapper in source maps, so DevTools still links each message to the code that logged it.
  - Fields named like passwords, salts, secrets and tokens are redacted when objects are serialised.
  - `DebugLogDialog` follows `dlg_view_log`: copy to clipboard, the persisted "Clear log when closing", and an extra Clear button. It opens from the user menu (an entry in #10's `userMenuEntries.ts`) and from Settings › General › Diagnostics.

## Parity rows closed
- **LONG-012**: closed for the palette (Light / Dark / System, live, persisted, contrast-checked). Table/card presentation options are follow-ups; see below.
- **LONG-015**: closed. Desktop's path settings and picture-cache method, size, TTL and naming options are N/A: data lives in the origin's IndexedDB, and card images live in the browser's HTTP cache, which a page cannot read or clear.
- **LONG-007**: closed. The log is bounded and in memory only, with credentials redacted and copy/clear. There is no separate download: copying gives the same text.
- **LONG-016**: partial. Every catalogue is reachable, locale tags are normalised, the choice persists, and switching is live. The Account page is now translated, and the account and moderation dialogs were already keyed. Still open: hard-coded English in TopBar (listed under Follow-ups) and a missing-key CI check.

## Desktop reference
- `cockatrice/src/interface/widgets/settings_page/appearance_settings_page.cpp`: Theme group, palette combo (Light, Dark, System order) and labels.
- `cockatrice/src/interface/theme_manager.cpp`, `theme_config.cpp`: System follows the OS scheme; an unset scheme means System (the fresh-install default).
- `cockatrice/src/interface/widgets/settings_page/general_settings_page.cpp`: the language control.
- `cockatrice/src/interface/widgets/settings_page/storage_settings_page.cpp`: page scope, mapped to browser equivalents.
- `cockatrice/src/interface/widgets/dialogs/dlg_view_log.cpp`: dialog title, "Copy to clipboard", "Clear log when closing" (persisted, default off), clear-on-close keeps the header.
- `cockatrice/src/interface/logger.cpp`: header lines plus a bounded buffer.

## Testing
After rebasing onto #19 (`e3a1137`), I ran `git submodule update --init` and `npm ci`, then the gate from the repo root, with Vitest capped at `--maxWorkers=2`:
- `npx turbo run typecheck --concurrency=1`: 5/5 tasks pass.
- `npm run lint`: 3/3 tasks pass, 0 errors.
- `npm test -- -- --maxWorkers=2`:
  - Sockatrice: 763 passed.
  - Datatrice: 1176 passed.
  - Webatrice: 1626 passed, 2 skipped. Both skips were already there.
- `npm run test:integration -- -- --maxWorkers=2`:
  - Sockatrice: 159 passed.
  - Datatrice: 132 passed.
  - Webatrice: 162 passed, 2 skipped. Both skips were already there.
- Webatrice e2e, once, on chromium, firefox and webkit. The session's local browsers don't match Playwright 1.60, so it ran in the pre-pulled `mcr.microsoft.com/playwright:v1.60.0-noble` image (`--network host`) against the 3.0.0 Servatrice stack. Result: **25 passed, 5 failed**. Every failure also fails the same way on the unmodified `origin/parity/19-settings` build, and each one comes from the container's network:
  - `app-boots` (chromium, webkit): `net::ERR_CERT_AUTHORITY_INVALID` console errors. The container does not trust the session's egress-proxy CA. This spec still imports `@playwright/test` directly, because the hermetic e2e fixture is not in this base yet.
  - `bulk-card-actions` (all three browsers): the two Forests land on the stack, not the battlefield. Without a card database, the type line comes from a Scryfall lookup, and that lookup fails on the same certificate error. The card's type is then unknown, and #19's play-to-stack routing (`typeLineToTableRow(undefined)` ≠ land row) sends it to the stack. When Scryfall is reachable, Forest resolves as a land. The screenshots show the light palette rendering correctly on the game board.
- New or changed specs in this rebase:
  - `userMenuEntries.spec`: dialog entries, and distinct destinations.
  - `TopBar.spec`: the debug log opens from its menu entry; the card-import test is kept.
  - `Account.spec` and the Account integration spec: the new keys and their interpolated values.

## Notes for reviewers
- **Rebase decisions (onto #19 `e3a1137`).**
  - **Settings versioning:** still only the settings *row* goes 1 → 2 (`SETTINGS_VERSION`). #19's Dexie `version(6)` schema is untouched, and no Dexie version is added.
  - **Navigation:** #10's `userMenuEntries.ts` is the single user-menu list. `UserMenuEntry` is now a union of route entries and dialog entries (`{ label, icon, dialog: UserMenuDialog }`). The TopBar owns one `openDialog` state, and renders `CardImportDialog` and `DebugLogDialog`. #10's hand-written Import cards button moved into the list as well, so both dialogs go through one path. The label moved from `TopBar.userMenu.debugLog` to `UserMenu.debugLog`, and `TopBar.i18n.json` is gone. Appearance and Storage are Settings sections, not menu entries.
  - **Composition:** ignore-list filtering (now Datatrice, #11) and notifications skipping #11's system notices are #19's code, and this branch does not touch either. #19's new DeckEditor save-failed and status colours were moved onto the status tokens during conflict resolution.
  - **`i18n-default.json`** was regenerated with `npm run translate`. The base's committed copy is stale (regenerating it on #19 alone reorders 69 lines), so the diff against #19 includes that reorder.
- **No Dexie migration.** Both new preferences live on the existing settings row, so no Dexie v6 is needed. The row's own `SETTINGS_VERSION` goes 1 → 2 in `settingsMigration.ts`. The v2 step:
  - keeps existing rows on **Dark**, the only look those users have seen, while fresh installs get desktop's **System** default;
  - adopts i18next's old `i18nextLng` localStorage value as the language preference.
- **Card Sources** is untouched. The reserved `SettingsSectionId.CardSources` id is still unregistered. The integrator wires `CardSourcesSettings` from `@app/feature-widgets/card-import` (sibling `parity/20-card-data`) by adding it to `features/settings/sections/index.ts`.
- **Language storage.** The persisted language is the settings row. The detector's localStorage key now only mirrors it for a flash-free boot: `caches: []`, so detected languages are no longer written back. As a result, "Use the browser's language" really does follow the browser. The language-name key `Common.languages.en-US` moved to `Common.languages.en_US`, so its existing translations need a Transifex re-sync. Eight new language-name keys were also added.
- **MUI ThemeProvider is back**, scoped in `AppThemeProvider`. CssBaseline stays removed and `mui-overrides.css` still paints surfaces. The 8 `theme.palette.grey[300]` dialog borders now use `theme.palette.divider`.
- **Visible colour shifts in dark mode.**
  - `text-red-300` and `text-red-400` now share one `--status-danger` (`#F87171`); emerald and yellow are merged the same way.
  - The navy game dialogs now use the purple tokens like the rest of the app.
  - On-image overlays (life total, counters, card name pills, phase tiles) keep their palette-independent white-on-shadow styling.
- **Debug log choices.**
  - It holds 500 lines rather than desktop's 128, because a browser session logs more per event.
  - Redaction is by key name only. Free-text chat that the socket layer logs on errors (for example, unknown message types) can still appear; the log never leaves memory unless the user copies it.
- **Clearing card data** does not drop the decks feature's in-memory `sessionCache` (a `features/` module that a settings control may not import), so lookups already made in this tab still resolve until reload.
- **Follow-ups:**
  - **Appearance:** card rendering (display card names, rounded corners, scale on hover, auto-rotate), card view rows, hand layout and the multi-column threshold. The board has no switches for these yet. Home-tab backgrounds, playmats and menu shortcuts are also not done.
  - **`card-import/CardImportForm.css`** still has light-only colours. It is left alone because the sibling card-data branch edits that widget.
  - **Legacy styles:** `LeftNav.css` and `.bottom-bar__container` look unused.
  - **ChatLog:** it uses a non-existent `text-accent-primary` class, so card names in the log are not accent-coloured.
  - **TopBar i18n (LONG-016):** about 20 literals are left: the tab titles (`Lobby`, `My Decks`, `Settings`, `Shortcuts`, `Account`, `Logs`, `Player`, `Room {id}`, `Deck #{id}`), which are built in non-component helpers and asserted by name in specs; the menu items `Snap grid`, `Toggle auto-hide phase tracker` (plus its two titles), `Sign out` and `Signed in`; `Close tab`; `View your decks`; and the `Connected` / `Disconnected` connection labels. Moving them needs `t` threaded into the tab helpers and the TopBar specs updated, which is more than a small leftover.
  - **e2e under a TLS-intercepting proxy:** see Testing. The code is unaffected. Re-run the two specs where Scryfall is reachable, or once the hermetic e2e fixture is in the base (that fixture was not checked for whether it stubs Scryfall).
  - **Pre-existing lint error:** `integration/src/services/dexie/resetDexie.ts` violates a boundaries rule. `npm run lint` does not lint `integration/`.
