---
'@cockatrice/webatrice': patch
---

Internal refactor of the deck list and deck editor; no visible change except one fix.

The bracket estimate no longer treats a failed Commander Spellbook or Scryfall request as "no combos" or "no game changers". It now shows a partial or unavailable estimate with a Retry button, and only a complete assessment is saved to the deck.

The deck pages, card-detail dialog and breakdown panel are split into tested pure modules (grouping, search query, stats, import/export, pricing, card detail), hooks that own state and persistence (deck list, autosave, pricing, card search, bracket assessment) and small presentational components. Characterization specs pin the Sockatrice commands and visible output of both pages.
