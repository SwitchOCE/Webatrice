# Design review: deck editor screen, follow-up

Answers of 06.11.26 to the five questions Switch asked on [PR #3](https://github.com/SwitchOCE/Webatrice/pull/3#issuecomment-6656162658) on 05.11.26, after the combined build went live. Questions are Switch's; answers are Matthew's (designer), in his words. Earlier round: [2026-11-04-deck-editor.md](2026-11-04-deck-editor.md).

Answers marked **Question for Switch** ask for his opinion; the one marked **Issue found** reports a bug.

## 1. Smaller windows

**Question:** "Deck list" means the part of the deck editor that shows the cards in your deck. On smaller windows, the header and the tools panel under the list now leave it much less room:

| Window size | Before these changes | Now, tools panel open | Now, tools panel collapsed |
|---|---|---|---|
| 1920×1080 | 918px | 701px | 848px |
| 1440×900 | 658px | 312px | 602px |
| 1280×720 | 478px | 102px (one row of cards) | 392px |

Should the tools panel start collapsed on smaller windows, or would you rather solve this another way?

**Answer:** The bottom sheet should be collapsed by default and the left and right drawers should be shrunk to their minimum width. The ui was designed not make the side drawers as narrow as possible. I came up with a way to provide the decklist section with even more space at narrower screen width. It can be found in the following frame in the webatrice brilliant file:

Decks / Deck open (feedback 28.10.26, A: stats in bottom sheet, card details collapsed)extra tag row

When the width of the screen shrinks to the point that the tag section needs to wrap, it instead moves downward to its own row. That way, the tags can extend all the way to the end of the screen before they need to wrap.

*The Brilliant project is public: [brilliant.design/vivid-starling/webatrice](https://brilliant.design/vivid-starling/webatrice), canvas `Webatrice`.*

## 2. Lobby deck cards

**Question:** We used your new deck card in the lobby, as you asked, but without its bottom row (tags, price and buttons). Do you want that row in the lobby too?

**Answer:** No, that’s fine to use the deck cards without the footers

## 3. Five cards in a row in the lobby

**Question:** We show five to fill the width. At 1280–1440 wide, each card is only 160–181px, so its details line and long deck names get cut off. Keep five, or show four wider cards at those sizes?

**Answer:** Wrap the deck title from the bottom up if it’s too long for the deck card

## 4. Change printing on search results

**Question:** A search result that's already in your deck shows Remove, but not Change printing until you click that card's row in the deck list. Is that OK?

**Answer:** Currently the user is able to add multiple different printings of the same card to their decklist meaning that there can we two list items with the same name in the decklist. We want to avoid this. The player should only be able to select one printing of a card and if the player changes a card printing on one drawer it should also change on the other drawer. When the player selects a card in the card search that is already in their deck, the right hand card selector should show the card printing selector. If we need to allow the palyer to select more than on printing for the same card then we will add that functionality via a modal, it should nto interfere with the main decklist ui. Ask switch his opinion on whether this multiple card printing functinality is needed. I just noticed an issue, when changeing the printing of a card in the right hand drawer, the selected prtinging is moved to the left of the row. That should not happen, the selected printing should stay in order

> [!IMPORTANT]
> **Question for Switch:** is choosing more than one printing of the same card in one deck needed? If it is, Matthew would add it through a modal that stays out of the main deck list.

> [!WARNING]
> **Issue found:** changing a card's printing in the right-hand drawer moves the chosen printing to the start of the printings row. The chosen printing should keep its place in the order.

## 5. Format colours

**Question:** Related formats share one colour instead of each having its own:

- Commander, Pauper Commander, Duel, Oathbreaker, PreDH and Standard Brawl share one
- Modern, Pioneer, Historic, Timeless and Future share one
- Legacy, Vintage, Premodern and Old School share one
- Standard and Pauper each have their own
- Penny Dreadful and Gladiator are grey, the same as a deck with no format, as you said

Is that what you want, or should any of these have their own colour?

**Answer:** Those colour families should be fine, ask Switch’s opinion on this matter. Do we need to give some formats their own colour?

> [!IMPORTANT]
> **Question for Switch:** should any formats get a colour of their own instead of sharing their family's colour?
