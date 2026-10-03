# Task fr4: apply rv15 to PR R4
Follow /tmp/notes/tasks/fix-template.md, with this branch mapping: the PR branch is `origin/claude/parity-r4-scryfall-catalog`, and the parent stays d2e516c (`restack-16-game-lobby`). Review: /tmp/notes/reviews/rv15.md. No history rewrite: new commits on top.

Apply every finding:
- **useGridRows Home/End:** restore the old behaviour. Home/End always select, even when the target is the current index. Add a failing-first spec.
- **Image-URL characterization:** replace the retyped-template table with specs that render or call each real call site (SeatCard, ZoneStack, deckCardImageUrl, BigCardPreview, …) and assert the URL it produces. Where possible, run them against the pre-R4 code too, and say so in the PR file.
- **Barrel:** `services/scryfall` exports only what features may use: the catalog API and the image-URL builders. The raw client (`fetchCollection`/`fetchNamedCard`/`fetchPrintings`) is internal. Enforce it with an eslint `no-restricted-imports` rule, allowing only `services/cards/catalog/*` and the pricing and bracket modules that need the client.
- **bracketTone:** move it (and its spec) to `components/` or `utils/`.
- **All nits:**
  - Fix the overclaim wording, with the `decks/search.ts` exception named.
  - Repoint the dangling header in `search.ts`.
  - Rename the game hook's type to `ScryfallCardUrls`.
  - Note the desktop sideboard-plan dedupe/sort difference in the codec doc.
  - Retitle the PR to `refactor(cards): … + fix(decks): keep sideboard plans`.
  - List the HandZone/StackColumn `lookupCard` calls as a follow-up for R2.

Gate: the full gate plus webatrice e2e on all browsers.
