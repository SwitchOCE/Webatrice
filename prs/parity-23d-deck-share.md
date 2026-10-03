# feat(decks): Cockatrice 3.1 deck share links and public decks (#7241)

## Summary

Brings Cockatrice 3.1's deck sharing (#7241) to Webatrice on Servatrice 3.1 servers: share links, publishing decks, and browsing another user's public decks. Everything is gated on `server.Selectors.supports(state, ServerCapability.DECK_SHARING)`. A 3.0 server shows none of it.

- **Sockatrice.** 03 already vendored the eight deck share and public-deck builders, but they only had success paths. Each one now reports a rejection or a missing answer through one new optional callback, `ISessionResponse.deckSharingFailed(command, responseCode, target, failure?)`. This mirrors the staff scopes' `commandFailed`. `DeckSharingCommandName` is exported from `/types`. The change is additive, so this is a minor bump.
- **Datatrice.**
  - The `server` slice keeps the caller's share links (`deckSharesMine`, emptied by `deckShareRemoved`) and other users' public deck trees (`publicDecks[userName]`).
  - `deckVisibilityChanged` sets the node's own public bit in the stored deck tree, reassigning cloned messages (`cloneWith`) so the frozen store stays valid.
  - The one-off answers are signal actions: `deckShareCreated`, `deckShareListed`, `deckShareDownloaded`, `publicDeckDownloaded` and `deckSharingFailed` (with the `DeckSharingFailedPayload` type).
  - New selectors: `getDeckSharesMine`, `getPublicDecks`.
- **Webatrice (`features/decks`).**
  - **My Decks** (18's list and folder seams).
    - Each deck row has **Share deck...**, which shares the stored deck by id. Each folder row has **Share decks**, which shares the folder by path. Both use the default name "Shared decks", like desktop's storage tab.
    - Each deck and folder row has **Publish/unpublish deck**. It flips the node's own bit, and the row shows desktop's **Public** / **Public (inherited)** badge with desktop's tooltips.
    - The header gains **Share links** (list and revoke your links) and **Open shared deck** (paste a link).
  - **Deck editor.** **Share deck...** shares the open deck inline with its WUBRG color identity, like `DlgShareDeck`. Before that it gives desktop's two refusals: not connected, and empty deck.
  - **Share dialog.** You name the share; it then shows the link and its expiry ("Share link created and copied to the clipboard: … The share expires on …"). It also has a **Copy link** button, because a browser may refuse a clipboard write once the server has answered.
  - **`/decks/shared?share=…&hostname=…&port=…`** (desktop `IntentOpenSharedDeck` + `DlgSharedDecksPreview`):
    - Lists the share's decks ("Share: …", "From host:port", "This share link expires on …").
    - Opens each deck read-only.
    - **Import to my decks** uploads a copy to the storage root and opens it in the editor.
    - Uses desktop's messages for a missing, expired, empty or unreadable share, and for a malformed link.
  - **`/decks/public/:userName`** (desktop `TabPublicDecks`). The per-user context menu offers **View this user's public decks** for registered users other than yourself, matching desktop's `UserContextMenu`. Decks there open read-only and can be imported.
  - **How a link reaches the app.** A Webatrice share link is Webatrice's own address with desktop's query: `https://<webatrice>/…?share=<token>&hostname=<host>&port=<port>`.
    - On page load, `DeckShareLinkRedirect` (mounted in AppShell after the routes) moves that query into `sessionStorage` and removes it from the address bar with `history.replaceState`. The MemoryRouter never reads the URL, and a reload must not reopen the link.
    - Once the user is logged in, it navigates to `/decks/shared?<query>`.
    - "Open shared deck" accepts the same link, or desktop's `cockatrice://opendeck?…`.

## Parity rows closed

- Deck share links: create a link (deck, several decks or a folder), copy it, open it, and import the shared decks. Revoking is also added (see Notes).
- Public decks: publish or unpublish a deck or folder, show Public / Public (inherited), and browse another user's public decks from the user menu.

## Desktop reference

Cockatrice master `add65caa` (PR #7241):
- `cockatrice/src/interface/widgets/dialogs/dlg_share_deck.cpp`: editor share dialog, its labels and its messages.
- `cockatrice/src/interface/widgets/deck_share/{deck_share_utils,share_bar_widget}.cpp`: link format (`cockatrice://opendeck?share&hostname&port`), clipboard, expiry format.
- `cockatrice/src/interface/widgets/tabs/tab_deck_storage.cpp`: `actShareSelection` (folder by path, decks by id, "Shared decks") and `actPublishDeck` (toggle the node's own bit, "Failed to change deck visibility on server (response code %1).").
- `cockatrice/src/interface/widgets/server/remote/remote_decklist_tree_widget.cpp`: the Public / Public (inherited) / Private column and its tooltips.
- `cockatrice/src/interface/intents/{url_parser,intent_open_shared_deck}.cpp`, `widgets/dialogs/dlg_shared_decks_preview.cpp`: link checks, list then download, and their messages.
- `cockatrice/src/interface/widgets/tabs/tab_public_decks.cpp`, `widgets/server/user/user_context_menu.cpp`: public decks tab and the menu entry's gating.
- `cockatrice/src/interface/widgets/tabs/abstract_tab_deck_editor.cpp`: `actShareDeck` refusals.
- `servatrice/src/serversocketinterface.cpp` (`cmdDeckShare*`, `cmdDeckSetVisibility`), `servatrice/servatrice.sql` (`cockatrice_deck_share.name` is varchar(64)).

## Testing

Run from the repo root on the tip `ffab0e4`:
- `npx turbo run typecheck --concurrency=1`: 5/5 tasks.
- `npm run lint`: 3/3 tasks, no errors.
- `npm test -- -- --maxWorkers=2`: sockatrice 791 passed (40 files), datatrice 1224 passed (30 files), webatrice 2144 passed (297 files).
- `npm run test:integration -- -- --maxWorkers=2`: sockatrice 168 passed, datatrice 139 passed, webatrice 204 passed + 2 skipped. The 2 skips are the existing game `describe.skip`. New here: `deck-sharing.spec.tsx` (8 tests), 2 sockatrice 3.1 round trips, 3 datatrice store cases.
- `npm run test:e2e -w @cockatrice/sockatrice`: 5/5 passed.
- Webatrice e2e, run in `mcr.microsoft.com/playwright:v1.60.0-noble` per the brief (chromium, firefox, webkit):
  - **3.0.0 image** (`ghcr.io/cockatrice/servatrice:2026-05-08-Release-3.0.0`), full suite: 39 passed, 6 skipped, 3 failed.
    - The 6 skips are the 3.1-only cases: the two deck-sharing cases on 3 browsers.
    - The 3 failures are `staff-tools.spec.ts` › "an admin publishes a new server message". That spec runs `execFileSync('docker', …)` to seed SQL, and the Playwright container has no docker CLI (`spawnSync docker ENOENT`). It is environmental and unrelated to this change.
    - `deck-sharing.spec.ts` › "deck sharing stays hidden" passed on all 3 browsers.
  - **Master image** (`webatrice-local/servatrice:master-add65ca`, built from `add65caa`), `deck-sharing.spec.ts` + `decks.spec.ts`: 9 passed, 3 skipped.
    - Passed: "a published deck is listed in the owner's public decks and can be imported", "a share link opens after login, imports, and stops working once revoked", and "deck folders…" on all 3 browsers.
    - Skipped: the 3.0-only case.

## Notes for reviewers

- **Revoke has no desktop UI.** Servatrice has offered `Command_DeckShareListMine` / `Command_DeckShareRemove` since #7241, but desktop has no view for them. The task asked for revoke, so "Share links" lists your live links (name, deck count, created, expires) with **Revoke** behind a confirmation. Those labels are ours. The server does not send tokens back, so a link can only be copied when it is created.
- **Opening shows a read-only view, not an unsaved editor tab.** Desktop opens each shared deck in an unsaved editor tab. Webatrice's editor only edits stored decks, so a shared or public deck opens read-only and **Import to my decks** stores a copy first. Desktop's "Open selected / Open all" multi-select becomes one **Open** per deck.
- **A link for another server does not reconnect.** Desktop asks, then reconnects to the link's server. A browser can't use the TCP port a desktop link names, and Webatrice has no stored credentials to reconnect with. So `/decks/shared` says which server the link is for ("This share link is for %1. Log in to that server to open it.").
  - Servers are compared by machine only, ignoring the port, so a desktop link works on the same server.
  - A web host's scheme, port or WebSocket path is ignored too, so `server.cockatrice.us` matches `server.cockatrice.us/servatrice`.
  - The link Webatrice creates names the selected known host and its WebSocket port.
- **Visibility is applied locally.** Desktop re-reads the whole tree 500 ms after publishing. Datatrice instead applies the acknowledged change to the stored tree. On failure, the page shows desktop's message once in an alert.
- **Deck rows don't fetch preview metadata.** The public decks page shows the server's preview metadata (color identity, tags); deck rows in My Decks still use the downloaded `.cod` summary as before.
- `FlatDeck` and `DeckFolderEntry` gain a required `visibility`. Spec fixtures were updated, and `connected31State` is the new shared fixture for a 3.1 session.
- **Follow-ups:**
  - No TopBar tab for `/decks/shared`, because the tab model keeps only the pathname and this route needs its query.
  - `persistLastRoute` drops the query, so a reload on that page shows the "missing hostname" message.
