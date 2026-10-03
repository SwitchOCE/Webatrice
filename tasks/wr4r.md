# Task wr4r: PR R4, `refactor(cards): Scryfall client and card-catalog layers`
Push branch: `claude/parity-r4-scryfall-catalog`. PR file: `parity-r4-scryfall-catalog`. Base: `origin/claude/restack-16-game-lobby`.
Spec: `/tmp/notes/specs/aud2.md` (the architecture audit). Follow the refactor idioms of PR 05/09: characterization specs first (pin current behaviour and request shapes before moving code), then move, then delete. No behaviour change unless the audit names a bug; list any such fixes separately in the PR file. Every commit typechecks. Gate: the full gate plus webatrice e2e on all browsers.
Implement the aud2 §4 "Not scheduled" items:
- **The `services/scryfall` client:** HTTP, 75-chunk batching, rate limiting and image-URL builders in one place.
- **Split `cardCatalog.ts` into its four layers:** Dexie mapper, Scryfall cache repo, HTTP client (now `services/scryfall`), catalog API.
- **D4:** lift `cardDetail.ts` to `services/` and make BigCardPreview and BattlefieldSidebar use it.
- **D5:** `pricing.ts`, `bracketSources.ts` and image-URL call sites use the client. Leave `decks/search.ts` alone (PR 31 will move it).
- **D7:** one ManaSymbols component, the deck pair, moved to `@app/components`.
- **D12:** `listKeyboard.ts` → `useGridRows`, adding PageUp/PageDown.
- **D13:** the small duplicates.
- **`serializeCod`:** add a `<sideboard_plan>` round-trip test.

Network behaviour must be byte-identical: same URLs, batch sizes and headers. Pin it with characterization specs that mock fetch.
