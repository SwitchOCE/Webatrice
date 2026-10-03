# refactor(cards): Scryfall client and card-catalog layers

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

  A characterization table pins each site's old template against its builder. `decks/search.ts` is untouched
  (PR 31).
- **D7.** The deck `ManaSymbols` / `SymbolText` pair moves to `@app/components` and the game copy is deleted.
  The symbol URL becomes `getScryfallSymbolUrl`, and the colour vocabulary stays in
  `features/decks/manaSymbols.ts`. The game's two callers that relied on the 16px default now pass it.
- **D12.** `listKeyboard.ts` moves to `hooks/gridNavigation.ts`, and its pure `navigationTarget` now drives
  `useGridRows`. Every roving-focus grid therefore gains PageUp/PageDown (ten rows). Manage Sets keeps its
  `aria-activedescendant` model and reads the same function.
- **D13.** The small duplicates:
  - `deckColorIdentity`: the `deckPersistence` copy wins;
  - `DECK_ZONE_MAIN/SIDE`: the lobby uses `@app/types`;
  - bracket tone: moves to `services/decks/bracketTone.ts` for the lobby and the deck editor;
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

Base `origin/claude/restack-16-game-lobby` @ `d2e516c`, tip `52f549b`. Every commit typechecks.

- `npx turbo run typecheck --concurrency=1`: 5/5 tasks pass.
- `npm run lint`: clean.
- `npm test`: all green.

  | Package | Spec files | Tests |
  |---|---:|---:|
  | sockatrice | 42 | 895 |
  | datatrice | 35 | 1310 |
  | webatrice | 447 | 3470 |
- `npm run test:integration`: all green.

  | Package | Spec files | Tests |
  |---|---:|---:|
  | sockatrice | 20 | 175 |
  | datatrice | 10 | 144 |
  | webatrice | 49 | 265 |
- Webatrice e2e on chromium, firefox and webkit: **69 passed and 12 skipped**. The Playwright image was
  v1.60.0-noble, running against Servatrice 3.0.0.
  - The first full run had 63 passed and 3 failed. The failures were `staff-tools.spec.ts:38` on all three
    browsers, an environment issue: the spec shells out to `docker compose exec mysql`, and the Playwright
    container has no docker CLI (`spawnSync docker ENOENT`).
  - Rerunning `staff-tools.spec.ts` with the docker CLI, the compose plugin and the socket mounted passed 6/6.
  - The 12 skips are the spec's own conditional skips. sockatrice e2e was not run because no sockatrice or
    server flow changed.
- New or changed specs:
  - characterization: catalog request shapes (7), pricing chunking (1), bracket sources (2), detail fetch
    signal (1), image-URL legacy table (7);
  - client (11), the catalog layers (dexie 4, cache 3, Scryfall mapper 4), `getScryfallSymbolUrl`,
    `formatLocalDateTime`;
  - `useGridRows` PageUp/PageDown;
  - `<sideboard_plan>` round-trip (2). This spec fails on the pre-fix codec, which I checked.

## Notes for reviewers

- **The id encoding in image URLs.** The builders always `encodeURIComponent` the Scryfall id. Six board sites
  used to interpolate it raw. Scryfall ids and providerIds are UUIDs, for which encoding is the identity, so the
  URLs (and browser-cache hits) are byte-equal. The characterization table uses a UUID.
- **What stays where.** `pictureUrlTemplates.ts` (desktop's user-configurable picture-URL defaults),
  `scryfallImage.ts` (URL size rewriting, not building), `CARD_BACK_URL` (a constant) and `decks/search.ts`
  (PR 31) still contain Scryfall hosts. Its header comment still points at `services/cards/cardCatalog.ts`.
  PR 31 should repoint it when it moves `search.ts` onto the client.
- **The game face pick.** `BigCardPreview` and `BattlefieldSidebar` keep their exact-name face pick rather than
  `selectCardFace`, because switching would change which face a token shows. A follow-up could unify them.
- **`deckViewModel`'s own `<sideboard_plan>` parser** is left alone (the audit's optional `readSideboardPlans()`
  belongs with R3 / the lobby split).
- **Changesets.** webatrice (patch) and datatrice (patch, internal `formatLeaveMessage` move).
