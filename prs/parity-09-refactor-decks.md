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
  - a stale saved assessment is cleared;
  - third-party calls time out after 15s (they had no timeout before);
  - an incomplete estimate shows its level as a floor ("N+", "At least bracket N");
  - the section always names its data sources (a provenance line);
  - a malformed or empty payload (no `included`, a Game Changers list with no names, a nameless collection entry,
    a timeout while the body streams) is reported as such, never as valid empty data.
- **Review fixes** (rv9, below): the bracket section is fully translated, Retry keeps keyboard focus, the shared
  dialog frame is a labelled modal dialog (DeleteDeckDialog uses it too), and the export dialog's "Copied"
  feedback survives editor re-renders.
- No other visual or behaviour change.

Commits (oldest first): characterization specs → pure policies → MyDecks split → editor split → card
detail and breakdown split → DATA-001 fix → hook/adapter specs → editor component specs → list, search,
breakdown and dialog component specs → changeset, then six review-fix commits (see "Review response"). Each
commit is green.

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

Full gate on the final tip `a3073b8` (2026-10-03, cloud run f0918):

| Gate | Result |
|---|---|
| `npx turbo run typecheck --concurrency=1` | 5/5 tasks pass, and at each of the six review-fix commits |
| `npm run lint` | 3/3 tasks pass, 0 problems |
| `npm test -- -- --maxWorkers=2` | webatrice 1871 tests (261 files) pass; sockatrice and datatrice are untouched by the review fixes (775 / 1196 at `ba8a091`) |
| `npm run test:integration -- -- --maxWorkers=2` | sockatrice 166 (19 files), datatrice 136 (9 files); webatrice 185 pass and 2 skipped (39 files) |

- The 2 skipped integration tests are the pre-existing `game/judge-override` and `game/library-view` skips; this
  branch doesn't touch them.
- Deck feature coverage:
  - Unit: `src/features/decks` now has 57 spec files and 299 tests (1 spec file at the base).
  - Integration: `decks.spec.tsx` has 11 tests and `deck-editor.spec.tsx` has 15.
    - The new `deckHelpers.tsx` provides fake Scryfall/Spellbook endpoints, deck fixtures and responders.
    - `command-capture.ts` gains `findAllSessionCommands`.
  - Three integration tests pin DATA-001:
    - a Spellbook 503 gives a partial estimate, no bracket upload, then Retry saves level 1;
    - a malformed Game Changers payload;
    - a stale saved assessment is cleared.

### E2E

`npm run test:e2e -w @cockatrice/webatrice` (under the shared e2e lock, before the review fixes): 18 passed (6.5m).
The review fixes change no server flow, so e2e was not rerun.

## Rebase (w0918r)

Rebased from old `f8d0250` onto `dc77ebd` (`parity/05-refactor-seat` on line A: 03, 12, 04, 10, 11, 13, 06). Line A's
deck command-failure handling (01) is carried into the split modules rather than dropped:

- **Deck list failure** (`DECK_LIST_FAILED`): now owned by `hooks/useDeckList` (`listError`, cleared by `refresh`);
  `Decks` renders the new `DeckListError` (in `components/list/DeckListStates`) with Retry instead of the spinner.
- **Deck download failure** (`DECK_DOWNLOAD_FAILED`): `hooks/useDeckEditor` exposes `loadError`; `DeckNotFound`
  (in `components/editor/DeckEditorShells`) takes a `reason` and shows `DeckEditor.loadFailedTitle` plus the reason.
- **Autosave failure**: `uploadDeckUpdate` (`deckPersistence`) takes an `onFailed`; `useDeckAutosave` adds the
  `failed` save state and rolls back the optimistic signature (ref and session cache) so the next save resends;
  `DeckSidebar` shows the failed indicator.
- Line A's `useDeckEditor.spec` tests moved into the per-module specs (`hooks/useDeckEditor.spec`,
  `hooks/useDeckAutosave.spec`, `deckPersistence.spec`), plus `DeckEditorShells`/`DeckSidebar` cases for the
  new props/states. One lint fix for this base's `brace-style` rule in `integration/src/features/deck-editor.spec.tsx`.

Gate on the rebased tip `ba8a091`: typecheck 5/5; lint 3/3; unit sockatrice 775, datatrice 1196, webatrice 1861
(261 files); integration sockatrice 166, datatrice 136, webatrice 185 passed + 2 skipped (pre-existing
`describe.skip` in game specs).

## Review response (rv9)

| Finding | Response |
|---|---|
| minor: Spellbook `results` without `included`, and a Game Changers list with no names, come back `ok` and empty | Fixed (`18753cd`). Missing/non-array `included` → `unavailable`/malformed; 0 Game Changer names → malformed, not cached. Specs for both. |
| minor: nameless collection entry throws, reported as `network`, half the chunk cached | Fixed (`18753cd`). The chunk is validated before anything is cached and comes back malformed; non-`SourceError` exceptions map to malformed. |
| minor: abort while reading the body reported as malformed | Fixed (`18753cd`). An AbortError from `res.json()` maps to `timeout`. |
| minor: bracket section half-translated | Fixed (`deae45e`). Title, progress, failure, methodology blurb (`<Trans>` with the link), bracket labels and the five badge labels are `DeckBracket.*` keys; badges carry an id instead of an English label. |
| minor: Retry drops focus to `<body>` | Fixed (`deae45e`). The section stays mounted across states and takes focus before retrying. Spec. |
| minor: `DeckDialogFrame` lacks dialog semantics | Fixed (`3d4c1b4`). `role="dialog"`, `aria-modal`, `aria-labelledby={titleId}` (required prop); DeleteDeckDialog uses the frame (its name is now its heading, "Delete deck?"). No focus trap yet: left for a shared dialog primitive. |
| minor: raw `Command_DeckUpload` looks sanctioned | Fixed (`89fbd76`). The doc comment calls it a layering exception and points at the `deckUpdate` follow-up (#18 replaces it). |
| minor: changeset/PR claim one visible change; test count | Fixed (`a3073b8` and this file). |
| minor: DATA-001 bundled in a refactor PR | Kept as its own commit with its own changeset paragraph. Not split into a separate PR: the brief asks for one changeset per package per PR, and 18 is stacked on this branch. |
| nit: `ExportDeckDialog` effect deps | Fixed (`6af6592`), deps `[open]`, with a spec. |
| nit: duplicated `isConnected` guard | Fixed (`89fbd76`). The hook returns whether it sent; the façade closes the dialog on `true`. |
| nit: DeckBreakdown comment | Fixed (`89fbd76`). |
| nit: integration spec imports by path | Fixed (`89fbd76`). `clearBracketSourceCaches` is exported from the feature barrel. |
| nit: two ManaSymbols owners | Not changed; follow-up (move to a shared `@app/components` owner). |

The review-fix commits on top of `ba8a091`: `18753cd`, `deae45e`, `3d4c1b4`, `6af6592`, `89fbd76`, `a3073b8`.

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

## Restack notes (wR2)

Rebased onto the restacked #05 (`b5759d0`); new tip `dc3a9aa`.

- **#20 deck switch on a mounted editor** (`b28895a`) → `hooks/useDeckEditor`: re-seed per `deckId` during render, `deckRef` synced in an effect so the old deck's unmount flush still serializes the deck it was edited on, and a cached deck re-marks its own saved signature. `resetSaved` also shows the deck as clean. The #20 spec lives on as `hooks/useDeckEditor.deckSwitch.spec.tsx`; the old failures spec is superseded by this PR's hooks specs.
- `ExportDeckDialog` keeps the chain's `downloadBlob`; the cache helper `hasCachedDeck` became unused and was dropped.
- **#21 tokens** carried into the split components (`bracketTone`, `SignalBadge`, `CardDetailDialog`, editor rows/sidebar) and this PR's own bracket-outage notice.
