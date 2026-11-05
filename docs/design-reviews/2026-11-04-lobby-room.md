# Design review: lobby and room games table

Webatrice PR review, 04.11.26, for [PR #1](https://github.com/SwitchOCE/Webatrice/pull/1). Questions from the review; answers from Matthew (designer), in his words.

## 1. Game cards lost information

**Question:** Removing the "Anyone can join / watching" row also removed "registered users only", "decklists shared", spectator chat/hand visibility and the spectator count. The room table still shows them. Keep the cards as designed, or add small badges?

**Answer:** Yes that information is not needed when decideing which game to play, that information can be found elsewhere in the ui

## 2. Deck tiles cut off the bracket at 1440

**Question:** Deck tiles at 1440 cut off the bracket ("99 cards · Bra") because the details line no longer wraps. Allow it to wrap, or drop an item?

**Answer:** I’ve created new deck card layouts for the deck screen, use those in the dashboard instead

## 3. Short game titles cut at 1920

**Question:** At 1920, the format pill now shares the title row, so short game titles get cut ("Commander night wit…"). The five decks also fill only about 70% of the row.

**Answer:** There should still be plenty of horizontal space for the game title. If the title is too long then truncate the title and add a tooltip on hover

## 4. "Go to " has no width limit

**Question:** "Go to " has no width limit. A long room name makes the button about 460px wide.

**Answer:** a long button is not a problem, set an upper limit to the width(the 460px mentioned above) and truncate the title beyond that width

## 5. Two-format cards at the narrowest size

**Question:** Our long-format fix caps the format block at half the card. At the narrowest card size (340px), a two-format card now shows "Comm…" and "Stan…" instead of the full names. Is that OK, or should only over-long names be cut?

**Answer:** That is ok for now, will review after implimentation and decide again on solution

## 6. Line between the nav toggle and the logo

**Question:** There's an extra full-height line between the nav toggle and the logo. Item 3 lists only the lines before ROOMS and GAMES. Intended?

**Answer:** Yes that line is intended
