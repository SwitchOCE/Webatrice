# Design review: deck editor screen

Webatrice PR review, 04.11.26, for [PR #3](https://github.com/SwitchOCE/Webatrice/pull/3). Questions from the review; answers from Matthew (designer), in his words. Answers marked **Question not understood** need a follow-up with him.

## 1. Smaller windows

**Question:** At 1440×900 the deck list shows 294px of cards (it was 658px). At 1280×720 it shows 75px, about one row (it was 478px). The header grows and the tools sheet takes about 335px. At 1280, undo/redo also sit alone on their own line. This is the biggest usability problem across the three PRs.

> [!WARNING]
> **Question not understood.** Matthew's answer:
>
> I don’t understand this one, could you send me a png of what you’re talking about? “ At 1440×900 the deck list shows 294px of cards” I don’t know exactly what this is refereing to

## 2. Removed controls

**Question:** These were removed: collapse-all groups; compact rows; the panel's To sideboard / To main / Details buttons (the row menu still has them); and the printings strip, which moved from Find cards into a collapsed section of the right column. Please confirm each was intended. Anyone who had picked compact rows stays in compact mode until they use More › Reset layout.

**Answer:** Yes all of those removed controls were intended. Those functions were eight not needed or replaced with better ux. Everything except for the card printing selector. The user should still be able to select which printing of a card they want when searching for a card but they should also be able to edit a selected card from their deck in a similar way int the “Selected” card section of the screen. As for the “Compact mode” Changeing from compact mode to non compact mode made alsomst not difference to the ui, it was pointless, just set the current non compact mode as the default for all users and remove the compact mode option.

## 3. Below the fold at 1920

**Question:** At 1920 with a card selected, Buy, Change printing and Remove sit below the fold. A bracket chip pushes the tags onto a third line. The + / SB tooltips on the first result row are cut off at the top.

> [!WARNING]
> **Partly not understood** (the tooltip part). Matthew's answer:
>
> The should be able to scroll down the card selector and access any inputs that don’t fit on the page. If the user drags the “Selected card” section so that the card image is smaller or collapses the card details section, all of the ui will fit onto the page without scrolling. It’s ok if the bracket chip causes the tags to move onto a third line. This will only happen if multiple tags are assigned to the deck. “The + / SB tooltips on the first result row are cut off at the top.” I don’t know what this means.

## 4. Non-Magic decks

**Question:** Non-Magic decks: the right column is now empty apart from its title.

**Answer:** If the ui is intended to also accomodate other games that are not magic the gathering then I’ll have to look into that. Leave for now.

## 5. Buy @ TCGplayer for search results

**Question:** Buy @ TCGplayer doesn't appear for a search result until the card is in the deck.

**Answer:** With the printing selector added back to the search sectoin of the ui, the user shold be able to see the price of the card there.
