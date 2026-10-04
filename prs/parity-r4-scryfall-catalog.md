# refactor(cards): Scryfall client and card-catalog layers + fix(decks): keep sideboard plans

## Summary

Implements the aud2 §4 "Not scheduled" items: one Scryfall client, the card-catalog layer split, D4, D5, D7,
D12, D13 and the `serializeCod` `<sideboard_plan>` round-trip test. It follows the PR 05/09 idiom:
characterization specs first, then the move, then the deletion. Network behaviour is byte-identical (same URLs,
chunk sizes, init objects and headers), and specs that mock `fetch` pin it.

- **Characterization first** (`5288a13`). Specs pin every Scryfall request shape before any code moved:
  - catalog: 75-identifier `/cards/collection` chunks sent in parallel with a bare `{method, headers, body}`
    init, and a one-argument exact-name GET;
  - pricing and the bracket oracle text: the same chunk size, one request at a time;
  - Game Changers and oracle text: only their timeout `signal`;
  - card detail: the caller's `signal`;
  - the catalog paths the audit found untested: a set+collector mismatch falling back to the name, NFC
    normalisation, Token stripping in batches and the refused-batch warning.
- **`services/scryfall/`: the one Scryfall client.**
  - `client.ts`: endpoint URLs, `SCRYFALL_COLLECTION_LIMIT` (75), `chunkForCollection`, `postCollection`,
    `fetchNamedCard`, `fetchCollection` (batch + hint matching), `fetchPrintings`, and
    `SCRYFALL_NAMED_RETRY_CAP` (50). Callers keep their own caching, sequencing and error policy.
  - **The raw client is internal.** `@app/services` exports only the image-URL builders (with
    `cleanScryfallName`) and the card-detail fetch. An eslint `no-restricted-imports` pattern lets only
    `services/cards/catalog/*`, `features/decks/pricing.ts` and `features/decks/bracketSources.ts` import
    `scryfall/client`, so nothing else can call Scryfall around the catalog's cache, session memo and retry cap.
  - `imageUrls.ts` (was `services/ScryfallService.ts`): `getScryfallUrl*`, plus `getScryfallUrlByExactName`,
    `getScryfallUrlByIdOrExactName` and `getScryfallSymbolUrl`.
  - `cardDetail.ts` (D4): the detail fetch, `ScryfallDetail`, `detailTargetKey` and `selectCardFace`.
  - **Rate limiting:** there was no throttle anywhere, only the 75-chunk batching and the 50-name retry cap.
    Both are now named in the client. No throttle or queue was added, because one would change request timing.
- **`services/cards/catalog/`** replaces `cardCatalog.ts` (1032 lines) with these layers:
  - `dexieCardMapper` (cards.xml → `LookupResult`);
  - `scryfallCache` (the Dexie `scryfallCache` table);
  - `scryfallCardMapper` (Scryfall → `LookupResult`);
  - `lookup` (the API: merge, session cache, retries);
  - `types`.

  The `services/cards` exports are unchanged. The 22 specs that mocked `services/cards/cardCatalog` now mock
  `catalog/lookup`. Each new module has its own spec.
- **D4.** The deck detail dialog, `BigCardPreview` and `BattlefieldSidebar` share one detail fetch and record
  type. The game views keep their own face pick, so nothing they render changes. The deck-only rules stay in
  `features/decks/cardDetail.ts`.
- **D5.** `pricing.ts` and `bracketSources.ts` send through `postCollection` / `chunkForCollection` and the
  search URL builder. `fetchJson` in `bracketSources.ts` takes a request thunk so its timeout signal still
  reaches every request. All nine inline image-URL sites change in one commit:
  - `SeatCard`, `ZoneStack`, `deckCardImageUrl`, `BattlefieldSidebar`, `CardPreviewPopupPage`,
    `BigCardPreview`;
  - `hydrate`, `deckSummary`;
  - the catalog's printing fallback.

  Each site has a spec that renders it (`SeatCard`, `ZoneStack`, `BigCardPreview`, `BattlefieldSidebar`,
  `CardPreviewPopupPage`) or calls it (`deckCardImageUrl`, `assembleDeckCard`, `deckArtUrl`, `dexieToLookup`) and
  asserts the literal URL it produces, by id and by a name with a comma and a Token suffix. All of them also pass
  against the pre-R4 site code (see Testing). `decks/search.ts` is untouched (PR 31) and is the one remaining
  place that builds Scryfall API URLs.
- **D7.** The deck `ManaSymbols` / `SymbolText` pair moves to `@app/components` and the game copy is deleted.
  The symbol URL becomes `getScryfallSymbolUrl`, and the colour vocabulary stays in
  `features/decks/manaSymbols.ts`. The game's two callers that relied on the 16px default now pass it.
- **D12.** `listKeyboard.ts` moves to `hooks/gridNavigation.ts`, and its pure `navigationTarget` now drives
  `useGridRows`. Every roving-focus grid therefore gains PageUp/PageDown (ten rows). Manage Sets keeps its
  `aria-activedescendant` model and reads the same function.
- **D13.** The small duplicates:
  - `deckColorIdentity`: the `deckPersistence` copy wins;
  - `DECK_ZONE_MAIN/SIDE`: the lobby uses `@app/types`;
  - bracket tone: moves to `utils/bracketTone.ts` for the lobby and the deck editor;
  - `formatLeaveMessage` (datatrice): the live implementation moves into `messageLog.ts` and replaces the dead
    copy;
  - `yyyy-MM-dd HH:mm`: becomes `utils/formatLocalDateTime`;
  - `HandSortKey`: comes from `gameDialogs.types`;
  - `ModerationNotice`: moves to `@app/types`;
  - auto-login's values: derived from the zod login schema;
  - the selected-card glow: becomes `SELECTED_CARD_GLOW` in `cardSize.ts`.

### Behaviour changes (each one named by the audit or the task)

1. **Fix: sideboard plans survived no web save** (`52f549b`). The requested round-trip test showed that
   `parseCod` never read `<sideboard_plan>`, which confirms the audit's "probably loses its plans". So every
   web save or re-upload of a desktop deck dropped them. Plans now pass through verbatim, like `<playmatCard>`,
   and are written after the zones as desktop's `DeckList::write` does. The save signature includes them.
2. **PageUp/PageDown in `useGridRows` grids** (D12, which the task asked for).
3. **Lobby bracket badge colour**: the lobby's copy had drifted to `bg-*/10`, while its comment says it should
   match the editor's `bg-*/15`. It now uses the shared palette.

## Parity rows closed

None. This is an architecture refactor (aud2 §4 "Not scheduled"). The sideboard-plan fix restores desktop parity
for `.cod` round-trips (`deck_list.cpp` `DeckList::write` / `readElement`).

## Desktop reference

- `libcockatrice_deck_list/libcockatrice/deck_list/deck_list.cpp`: `DeckList::write` (metadata → zones →
  sideboard plans) and `readElement`.
- `sideboard_plan.cpp`: element shape.
- Qt view page step (D12).
- `report_utils::formatReportTime` (D13).

## Testing

Base `origin/claude/restack-16-game-lobby` @ `d2e516c`. Tip `eca62b5` (the rv15 fixes are new commits on top of
`52f549b`, with no history rewrite).

- `npx turbo run typecheck --concurrency=1`: 5/5 tasks pass.
- `npm run lint`: clean.
- `npm test`: all green.

  | Package | Spec files | Tests |
  |---|---:|---:|
  | sockatrice | 42 | 895 |
  | datatrice | 35 | 1310 |
  | webatrice | 452 | 3478 |
- `npm run test:integration`:

  | Package | Spec files | Tests |
  |---|---:|---:|
  | sockatrice | 20 | 175 |
  | datatrice | 10 | 144 |
  | webatrice | 49 | 264 passed, 1 failed |

  The one failure is `integration/src/features/game/invite-link.spec.tsx:174` ("a link clicked in a room's chat
  opens the game with one navigation"), and it is intermittent. It also fails on the base `d2e516c` (4 of 5
  isolated runs) and on the pre-review tip `52f549b` (4 of 5), so this branch did not cause it. The likely cause:
  a synchronous `getByRole('button', { name: 'back' })` runs right after the location `waitFor`, which races the
  game page's render. Proposed fix, on the base branch: `fireEvent.click(await screen.findByRole('button', { name: 'back' }))`.
- Webatrice e2e on chromium, firefox and webkit: **66 passed and 12 skipped**, with 26 tests per browser. It ran
  in the Playwright image v1.60.0-noble against Servatrice 3.0.0, with the docker CLI, the compose plugin and the
  socket mounted so that `staff-tools.spec.ts` can reach MySQL. The 12 skips are the specs' own conditional skips.
- **Image-URL call-site specs against the pre-R4 code.** I restored each site's `d2e516c` source in place and ran
  the new specs against it: `SeatCard`, `ZoneStack`, `deckCardImageUrl`, `hydrate`, `deckSummary`,
  `BattlefieldSidebar`, `CardPreviewPopupPage` and `BigCardPreview`. The last three also needed the deleted game
  `ManaSymbols`. The result was 8 files and 27 tests passed. `dexieCardMapper.spec.ts` (4 tests) passed against
  the old private `dexieToLookup` in `cardCatalog.ts` once it was exported for the run. So the URLs are
  unchanged at every site.
- New or changed specs:
  - characterization: catalog request shapes (7), pricing chunking (1), bracket sources (2), detail fetch
    signal (1);
  - per-site image URLs: `SeatCard` (3), `ZoneStack` (1), `BigCardPreview` (2), `BattlefieldSidebar` (2),
    `CardPreviewPopupPage` (2), `assembleDeckCard` (2), `deckCardImageUrl` (+1). `deckArtUrl` and the catalog's
    printing fallback were already pinned with literal URLs;
  - client (11), the catalog layers (dexie 4, cache 3, Scryfall mapper 4), `getScryfallSymbolUrl`,
    `getScryfallUrlByExactName`, `formatLocalDateTime`;
  - `useGridRows`: PageUp/PageDown, and Home/End on the row that is already the target. The latter fails before
    the fix;
  - `<sideboard_plan>` round-trip (2). This spec fails on the pre-fix codec, which I checked.

## Notes for reviewers

- **The id encoding in image URLs.** The builders always `encodeURIComponent` the Scryfall id. Six board sites
  used to interpolate it raw. Scryfall ids and providerIds are UUIDs, for which encoding is the identity, so the
  URLs (and browser-cache hits) are byte-equal. The characterization table uses a UUID.
- **What stays where.** `pictureUrlTemplates.ts` (desktop's user-configurable picture-URL defaults),
  `scryfallImage.ts` (URL size rewriting, not building), `CARD_BACK_URL` (a constant) and `decks/search.ts`
  (PR 31) still contain Scryfall hosts. `search.ts`'s header now points at `catalog/lookup.ts`.
- **The game face pick.** `BigCardPreview` and `BattlefieldSidebar` keep their exact-name face pick rather than
  `selectCardFace`, because switching would change which face a token shows. A follow-up could unify them.
- **Sideboard plan order.** The codec keeps plans in file order, duplicates included. Desktop reads them into a
  name-keyed map (a later duplicate wins) and writes them sorted by name, so a desktop re-save can differ byte-wise
  from a web save; both load the same plans.
- **Follow-up for R2: `HandZone` / `StackColumn` call `lookupCard` straight from components**
  (`HandZone.tsx:280`, `StackColumn.tsx:132`), which the aud2 cardCatalog row names. This PR leaves them alone; they
  should move behind a `useCardCatalogMeta`-style hook, as planned for the ZoneViewPanel split.
- **`deckViewModel`'s own `<sideboard_plan>` parser** is left alone (the audit's optional `readSideboardPlans()`
  belongs with R3 / the lobby split).
- **Changesets.** webatrice (patch) and datatrice (patch, internal `formatLeaveMessage` move).

## Review response (rv15)

- **`useGridRows` Home/End (minor)**: fixed in `29edc46`. Home and End always select again, as they did before
  the refactor, even when the focused row is already the target. The arrows and PageUp/PageDown still stop at
  either end. The new spec ("selects on Home and End even when the focused row is already the target") failed
  before the fix.
- **Image-URL characterization (minor)**: fixed in `b5e34ab`. The retyped-template table is gone. Every call site
  now has a spec that renders or calls it and asserts the literal URL, including `SeatCard`'s
  `cleanScryfallName(name) || name` path (a name that is only "Token"). All of them pass against the pre-R4 code
  too (see Testing).
- **Barrel (minor)**: fixed in `abdc415`. `services/scryfall` exports only the image-URL builders, with
  `cleanScryfallName`, and the card-detail fetch. `fetchCollection`, `fetchNamedCard`, `fetchPrintings` and the
  rest of `client.ts` are internal. An eslint `no-restricted-imports` pattern (`**/scryfall/client`) allows only
  `src/services/cards/catalog/**`, `features/decks/pricing.ts` and `features/decks/bracketSources.ts`. The
  existing WebClient restriction moved into a shared constant, so both rules apply together. The instructions
  file documents the rule.
- **bracketTone (minor)**: fixed in `33fed80`. It moved to `utils/bracketTone.ts` with its spec, next to `cx()`,
  because it is a pure class-string helper rather than a component.
- **Nits** (`eca62b5`):
  - the one-client claim in the instructions, the `client.ts` header and the changeset now names the
    `features/decks/search.ts` exception (PR 31);
  - `search.ts`'s header points at `catalog/lookup.ts`;
  - the game hook's type is now `ScryfallCardUrls`;
  - the `sideboardPlansXml` doc notes the desktop dedupe/sort difference;
  - the PR is retitled;
  - the `HandZone`/`StackColumn` follow-up is listed under Notes.

## Restack notes (wR4a)

Branch `claude/restack-r4-scryfall-catalog`, tip `2798f7d`, 15 commits on R6. The `cardCatalog.ts` split carries 25b's `cipt`, `landscape` and per-face `text`; the game chain's specs mock `services/cards/catalog/lookup`. `formatLeaveMessage` is imported from `messageLog` in R6's `game.listeners.players.ts`. D13's `SELECTED_CARD_GLOW` is not added (25b's `SELECTED_RING` already folds it). HandZone/StackColumn keep 25b's `useSeatClickToPlay`; no inline `lookupCard` survives. `BattlefieldSidebar.spec` stubs 17b's `GameMenu`.
