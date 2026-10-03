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
    - Each deck row has **Share deck...**, which shares the stored deck by id. Each folder row has **Share decks**, which shares the folder by path (enabled only when the folder holds decks of its own, since Servatrice shares no subfolders). Both use the default name "Shared decks", like desktop's storage tab. Sharing several hand-picked decks in one link is not offered yet (see follow-ups).
    - Each deck and folder row has **Publish/unpublish deck**. It flips the node's own bit, and the row shows desktop's **Public** / **Public (inherited)** badge with desktop's tooltips.
    - The header gains **Share links** (list and revoke your links) and **Open shared deck** (paste a link).
  - **Deck editor.** **Share deck...** shares the open deck inline with its WUBRG color identity, like `DlgShareDeck`. Before that it gives desktop's two refusals: not connected, and a blank deck (`isBlankDeck`: no cards and no metadata).
  - **Share dialog.** You name the share; it then shows the link and its expiry ("Share link created and copied to the clipboard: … The share expires on …"). It also has a **Copy link** button, because a browser may refuse a clipboard write once the server has answered. Closing the dialog drops a create still in flight, so a late answer is never copied. Without a known server the create is refused, since the link could never open.
  - **`/decks/shared?share=…&hostname=…&port=…`** (desktop `IntentOpenSharedDeck` + `DlgSharedDecksPreview`):
    - Lists the share's decks ("Share: …", "From host:port", "This share link expires on …").
    - Opens each deck read-only.
    - **Import to my decks** uploads a copy to the storage root and opens it in the editor.
    - Uses desktop's messages for a missing, expired, empty or unreadable share, and for a malformed link.
  - **`/decks/public/:userName`** (desktop `TabPublicDecks`). The per-user context menu offers **View this user's public decks** for registered users other than yourself, matching desktop's `UserContextMenu`. Decks there open read-only and can be imported.
  - **How a link reaches the app.** A Webatrice share link is Webatrice's own address with desktop's parameters in the **fragment**: `https://<webatrice>/…#share=<token>&hostname=<host>&port=<port>`. The token is a bearer secret (desktop redacts it from its logs). A fragment is never sent to the web host or in a Referer, so the token can't land in host, CDN or proxy access logs.
    - On page load, `DeckShareLinkRedirect` (mounted in AppShell after the routes) reads the fragment once, removes it from the address bar with `history.replaceState` (so it isn't left in browser history and a reload doesn't reopen it), and keeps it **in memory only**. The MemoryRouter never reads the URL.
    - Once the user is logged in, it navigates to `/decks/shared?<parameters>` inside the MemoryRouter.
    - "Open shared deck" accepts the same link, the query form, or desktop's `cockatrice://opendeck?…`. Other schemes (`javascript:`, `data:` …) are refused.
    - **The token is only sent to a matching server, and the check fails closed.** If this session's server isn't known (known hosts not loaded, none selected) or doesn't match the link's host, the page says which server the link is for and sends nothing.

## Parity rows closed

- Deck share links: create a link (a deck or a folder), copy it, open it, and import the shared decks. Revoking is also added (see Notes). Sharing a multi-deck selection (desktop `actShareSelection` with several decks) is **not** closed: see follow-ups.
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

Run from the repo root on the tip `23c850e`:
- `npx turbo run typecheck --concurrency=1`: 5/5 tasks, at **every** commit of `a7b9684..23c850e` (17 commits, checked one by one).
- `npm run lint`: 3/3 tasks, no errors.
- `npm test -- -- --maxWorkers=2`: sockatrice 791 passed (40 files), datatrice 1224 passed (30 files), webatrice 2162 passed (297 files).
- `npm run test:integration -- -- --maxWorkers=2`: sockatrice 168 passed, datatrice 139 passed, webatrice 204 passed + 2 skipped (the existing game `describe.skip`). `deck-sharing.spec.tsx`: 8 tests.
- `npm run test:e2e -w @cockatrice/sockatrice`: not rerun; no sockatrice or server-protocol change in the fixes.
- Webatrice e2e, in `mcr.microsoft.com/playwright:v1.60.0-noble` (chromium, firefox, webkit):
  - **3.0.0 image**, full suite: 39 passed, 6 skipped, 3 failed. The 6 skips are the 3.1-only deck-sharing cases. The 3 failures are `staff-tools.spec.ts` › "an admin publishes a new server message" (`spawnSync docker ENOENT`: the Playwright container has no docker CLI), the same environmental failure as before the fixes. "deck sharing stays hidden" passed on all 3 browsers.
  - **Master image** (`webatrice-local/servatrice:master-add65ca`), `deck-sharing.spec.ts` + `decks.spec.ts`: 9 passed, 3 skipped (the 3.0-only case). The share-link case now checks the link has an empty query, carries `#share=`, and that the address bar no longer holds `share=` after load.

## Notes for reviewers

- **Revoke has no desktop UI.** Servatrice has offered `Command_DeckShareListMine` / `Command_DeckShareRemove` since #7241, but desktop has no view for them. The task asked for revoke, so "Share links" lists your live links (name, deck count, created, expires) with **Revoke** behind a confirmation. Those labels are ours. The server does not send tokens back, so a link can only be copied when it is created.
- **Opening shows a read-only view, not an unsaved editor tab.** Desktop opens each shared deck in an unsaved editor tab. Webatrice's editor only edits stored decks, so a shared or public deck opens read-only and **Import to my decks** stores a copy first. Desktop's "Open selected / Open all" multi-select becomes one **Open** per deck.
- **A link for another server does not reconnect.** Desktop asks, then reconnects to the link's server. A browser can't use the TCP port a desktop link names, and Webatrice has no stored credentials to reconnect with. So `/decks/shared` says which server the link is for ("This share link is for %1. Log in to that server to open it.").
  - Servers are compared by machine only, ignoring the port, so a desktop link (TCP port 4747) works on the same server reached over WebSocket (4748). See the review response.
  - A web host's scheme, port or WebSocket path is ignored too, so `server.cockatrice.us` matches `server.cockatrice.us/servatrice`.
  - The link Webatrice creates names the selected known host and its WebSocket port.
- **Visibility is applied locally.** Desktop re-reads the whole tree 500 ms after publishing. Datatrice instead applies the acknowledged change to the stored tree. On failure, the page shows desktop's message once in an alert.
- **Deck rows don't fetch preview metadata.** The public decks page shows the server's preview metadata (color identity, tags); deck rows in My Decks still use the downloaded `.cod` summary as before.
- `FlatDeck` and `DeckFolderEntry` gain a required `visibility`. Spec fixtures were updated, and `connected31State` is the new shared fixture for a 3.1 session.
- **Follow-ups:**
  - **Multi-select sharing** (desktop `actShareSelection` sends one `Command_DeckShareCreate` with a `DeckShareItem` per selected deck). 18's deck list has no selection model; sharing several hand-picked decks needs one first.
  - Compare against the **live connection's** host rather than the selected known host. No Datatrice state carries the connected host today; login always connects the selected host, so they agree in practice.
  - Correlate "Import to my decks" with its own `Command_DeckUpload` answer. It still matches by deck name at the storage root, because the request API has no per-call callback.
  - No TopBar tab for `/decks/shared`, because the tab model keeps only the pathname and this route needs its query. The public-decks tab title is hard-coded English, like the other transient tab titles in `detectTransientTab`.
  - `persistLastRoute` drops the query, so a reload on that page shows the "missing hostname" message.

## Review response (rv10)

History: the red intermediate commit is gone (`ee23217` squashed into the visibility commit). The specs commit `8435f08` is folded into the feature commit, so the feature ships with its specs. The source change and changeset that sat in the `test(sharing)` commit moved into the feature commit. Two more red commits in the original series were also fixed: the datatrice commit didn't update the webatrice store fixture, and the visibility commit used `'side'` before the category rename. Every commit now typechecks. Each fix below is its own commit.

- **major: token in the query string** → fixed. The link is `https://<webatrice>/#share=…&hostname=…&port=…`. It's read once from `location.hash`, stripped with `replaceState`, and held in memory only (no more `sessionStorage`) until login. The query form is accepted only when pasted. Specs: the built link has an empty `search`; the capture ignores a query link, strips the fragment and keeps other fragment parameters; the redirect leaves nothing in `href` or `sessionStorage`. The e2e asserts the same.
- **major: fail-open server check** → fixed. With no known server, or one that doesn't match, nothing is sent and the page shows "This share link is for … Log in to that server to open it." Specs: known hosts not loaded, and no selected host; both fail before the fix. *Not done:* comparing against the live connection's host. No Datatrice state carries it, and adding it would widen sockatrice and datatrice. Login always connects the selected known host. Listed as a follow-up.
- **major: "several decks" claim** → claim corrected. 18's deck list has no selection model, so multi-select sharing is a declared follow-up.
- **minor: port ignored** → not applied. A desktop link names Servatrice's TCP port (4747), while this session only knows its WebSocket port (4748) on the same server. Comparing ports would reject every desktop link for the server you're logged into. Fail-closed matching on the machine name is kept.
- **minor: cancel doesn't drop the pending create** → fixed (`share.reset()` on close in My Decks and the editor). The spec fails before the fix.
- **minor: link with empty host** → fixed. The create is refused with a message.
- **minor: folder share counts nested decks / `disabled:hidden`** → fixed. A new `directDeckCount`; Share stays visible but disabled.
- **minor: empty-deck refusal stricter than desktop** → fixed (`isBlankDeck` mirrors `DeckList::isBlankDeck`).
- **minor: misleading text on 3.0** → fixed. Both pages say the server doesn't support share links or public decks.
- **minor: import drops color identity / name correlation** → color identity fixed. Correlation is a follow-up, because the request API has no per-call callback.
- **minor: ReadOnlyDeck hides zones** → not applied. `parseCod` coerces every non-side zone (tokens, commander, unknown) into `main` (`zoneNameToCategory`), so no parsed card is hidden. `DeckCategory` has only `main` and `sideboard`.
- **minor: revoke confirm off-screen** → fixed. It scrolls into view and focuses Revoke.
- **minor: weak redirect spec** → fixed. Exact pathname assertions, plus hostile, encoded and extra-parameter cases.
- **minor: commits 5e9e7ec / f8b52be** → fixed (see History).
- **nit: public decks for yourself** → shown disabled, like desktop.
- **nit: TopBar title** → follow-up. Every transient tab title in `detectTransientTab` is plain English today.
- **nit: any scheme accepted** → fixed. Only `http(s):` and `cockatrice://opendeck` are accepted.
- **nit: link field label** → "Share link".
