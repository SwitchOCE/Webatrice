# refactor(webatrice): split the deck list and deck editor by responsibility

## Summary

- Behaviour-preserving refactor of `features/decks`. The five oversized modules (`DeckEditor.tsx` 2737 lines,
  `Decks.tsx` 1801, `CardDetailModal.tsx` 824, `DeckBreakdown.tsx` 670, `useDeckEditor.ts` 611, plus
  `ExportDeckModal.tsx` 337) become:
  - pure policy modules, each with a spec;
  - hooks that own state and persistence behind a narrow interface;
  - small prop-driven components.
  The two route files are now thin façades (`DeckEditor.tsx` 159 lines, `Decks.tsx` 123).
- Phase 0 came first. Characterization specs pin the real Sockatrice commands and the visible output of both
  routes before anything moved (`integration/src/features/decks.spec.tsx`, `deck-editor.spec.tsx`).
- One owner per concern:
  - Escape handling → `useEscapeKey`;
  - mana symbols → `manaSymbols.ts` and `components/ManaSymbols.tsx`;
  - Scryfall image sizing → `scryfallImage.ts`;
  - the dialog overlay → `DeckDialogFrame`;
  - the deck list cache → `useDeckList`;
  - the editor cache → `deckEditorCache.ts`.
- **Fix, DATA-001** (from the architecture review): the bracket estimate used to treat a failed Commander
  Spellbook / Scryfall / Game Changers request as authoritative empty data. It then showed and saved a level
  that was too low. The calls now go through an explicit adapter (`bracketSources.ts`) that returns
  `ok | partial | unavailable`:
  - the UI shows a partial or unavailable estimate with a Retry button;
  - only a complete analysis is persisted to the deck;
  - a stale saved assessment is cleared.
- No other visual or behaviour change.

Commits (oldest first): characterization specs → pure policies → MyDecks split → editor split → card
detail and breakdown split → DATA-001 fix → hook/adapter specs → editor component specs → list, search,
breakdown and dialog component specs → changeset. Each commit is green.

## Module map (before → after)

All paths are relative to `packages/webatrice/src/features/decks/`.

| Before | After |
|---|---|
| `Decks.tsx` (route, 1801) | `Decks.tsx` façade.<br>Data:<ul><li>`hooks/useDeckList.ts` (list fetch, summaries, `clearDecksListCache`)</li><li>`hooks/useDeckListViewMode.ts`</li><li>`hooks/useDeckImportFlow.ts`</li></ul>Policies:<ul><li>`deckTree.ts` (flatten, age)</li><li>`deckSummary.ts` (summary, art, format sections)</li><li>`deckImport.ts` (paste/.cod → `.cod`)</li></ul>UI:<ul><li>`components/list/` `DeckListHeader`, `DeckListSections`, `DeckListStates`, `DeckRow`, `DeckBadges`</li><li>`components/FormatPicker.tsx`</li><li>`dialogs/` `CreateDeckDialog`, `DeleteDeckDialog`, `ImportDeckDialog`, `DeckDialogFrame`</li></ul> |
| `DeckEditor.tsx` (route, 2737) | `DeckEditor.tsx` façade.<br>Hooks:<ul><li>`hooks/useDeckAutosave.ts`</li><li>`hooks/useDeckPricing.ts`</li><li>`hooks/useDeckImagePreload.ts`</li><li>`hooks/useQuickAddSuggestions.ts`</li><li>`hooks/useScryfallCardSearch.ts`</li><li>`hooks/useCardPrintings.ts`</li><li>`hooks/useEscapeKey.ts`</li></ul>Policies:<ul><li>`deckGrouping.ts`</li><li>`cardSearchQuery.ts`</li><li>`manaSymbols.ts`</li><li>`scryfallImage.ts`</li><li>`pricing.ts` (`pricingProgress`, `unpricedCards`)</li><li>`search.ts` (`searchCardImage`, `searchCardAsPreview`)</li></ul>UI:<ul><li>`components/editor/` `DeckSidebar`, `DeckBuyButton`, `DeckCardPreview`, `DeckMainPane`, `QuickAddSearch`, `PlainCardList`, `DeckCardGroup`, `DeckCardRow`, `DeckRowActionsMenu`, `DeckEditorShells`, `editorStyles`</li><li>`components/search/` `AdvancedCardSearch`, `CardSearchFilters`</li><li>`dialogs/PrintingPickerDialog.tsx`</li></ul> |
| `useDeckEditor.ts` (611) | `hooks/useDeckEditor.ts` (load + edit state).<br>`deckEdits.ts` (pure edit transitions).<br>`deckPersistence.ts` (`serializeDeckForSave`, `uploadDeckUpdate`).<br>`deckEditorCache.ts`. |
| `CardDetailModal.tsx` (824) | `dialogs/CardDetailDialog.tsx`.<br>`hooks/useCardDetail.ts` (fetch/browse).<br>`cardDetail.ts` (Scryfall detail fetch, face selection, row resolution, view model). |
| `ExportDeckModal.tsx` (337) | `dialogs/ExportDeckDialog.tsx`.<br>`deckExport.ts` (plain / Arena / `.cod`, file name). |
| `DeckBreakdown.tsx` (670) | `components/breakdown/DeckBreakdown.tsx`.<br>`deckStats.ts`.<br>`components/breakdown/` `ManaCurve`, `ColorPie`, `TypeBreakdown`, `BreakdownBlocks`, `SignalBadge`, `BracketSection` (+ `BracketSection.i18n.json`).<br>`hooks/useBracketAssessment.ts`.<br>`bracketTone.ts`.<br>`bracketBadges.ts`. |
| `bracket.ts` (fetched its own data) | `bracket.ts` returns `BracketAnalysis { report, unavailable }`.<br>`bracketSources.ts` is the third-party adapter (Game Changers, Scryfall oracle text, Commander Spellbook): 15s timeout, `SourceResult`, and only complete responses are cached. |

`index.ts` still exports the routes. It now takes `clearDecksListCache` from `hooks/useDeckList` and
`clearDeckEditorCache` from `deckEditorCache`.

## Parity rows closed

n/a. This is an internal refactor. DATA-001 comes from the architecture review, not the parity matrix.

## Desktop reference

None mirrored. The web deck list and editor have no one-to-one desktop counterpart in this refactor, and the
bracket estimate is web-only.

## Testing

Run from the worktree root on 2026-10-03.

| Gate | Result |
|---|---|
| `npm run typecheck` | 5/5 tasks pass |
| `npm run lint` | 3/3 tasks pass, 0 problems |
| `npm test -- -- --maxWorkers=2` | sockatrice 604, datatrice 1083, webatrice 1548 tests (223 files): all pass |
| `npm run test:integration -- -- --maxWorkers=2` | sockatrice 146, datatrice 124 pass; webatrice 157 pass and 2 skipped (36 files) |

- The 2 skipped integration tests are the pre-existing `game/judge-override` and `game/library-view` skips; this
  branch doesn't touch them.
- Deck feature coverage:
  - Unit: `src/features/decks` now has 57 spec files and 280 tests (1 spec file at the base).
  - Integration: `decks.spec.tsx` has 11 tests and `deck-editor.spec.tsx` has 15.
    - The new `deckHelpers.tsx` provides fake Scryfall/Spellbook endpoints, deck fixtures and responders.
    - `command-capture.ts` gains `findAllSessionCommands`.
  - Three integration tests pin DATA-001:
    - a Spellbook 503 gives a partial estimate, no bracket upload, then Retry saves level 1;
    - a malformed Game Changers payload;
    - a stale saved assessment is cleared.

### E2E

`npm run test:e2e -w @cockatrice/webatrice` (under the shared e2e lock): 18 passed (6.5m).

## Notes for reviewers

- **Pre-existing, kept.** Every scheduled autosave uploads, because `touchMeta` bumps `updatedAt` before the
  dirty check. This is unchanged and now visible in `hooks/useDeckAutosave.ts`.
- **Pre-existing, kept.** Autosave sends `Command_DeckUpload` with `{deckId, deckList}` and no `path`. Proto2
  field presence matters here, so it bypasses the Sockatrice `deckUpload` wrapper. That raw call is now
  isolated in `deckPersistence.ts`.
  - Follow-up: add a Sockatrice `deckUpdate` command.
- **Pre-existing, kept.** Spellbook still receives sideboard quantities merged into the main deck.
- **Deferred.**
  - A consent/opt-out for the third-party bracket calls.
  - A completeness flag in the persisted assessment schema.
- The Escape listener for the editor dialogs now uses the shared `useEscapeKey` (document). The Delete dialog
  still listens on `window`, as before.
- I removed a dead branch in the uploaded-file summary: a legacy `'commander'` total that no caller could reach.
- `.cod` export still leaves out the cached bracket assessment, as before. A spec pins this.
- Renames: `CardDetailModal` → `dialogs/CardDetailDialog` and `ExportDeckModal` → `dialogs/ExportDeckDialog`.
  Both are internal to the feature.

## Follow-ups

No change on this branch. The items it left for later are handled in #18's follow-up commits (see "Follow-ups" in
`parity-18-decks.md`):
- the Spellbook sideboard merge (the sideboard is no longer sent);
- the consent for the third-party bracket calls (off until the user allows it).

The Sockatrice `deckUpdate` follow-up was already in #18; its new response callbacks are now optional.
The completeness flag in the persisted assessment schema is still open.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
