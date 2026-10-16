# Worked example: "16.10.26 webatrice" (Notion export)

How the intake step should split the designer's first document. Tags: **V** Visual, **B** Behaviour (Needs developer), **G** Bug. "First question" is what Step 2 asks first; items marked *firm* need only a mock.

## Left nav

| # | Item | Tag | First question |
|---|---|---|---|
| 1 | Dashboard gets its own nav item instead of the logo; or the logo behaves like a nav item (hover, selected, size, position) | V | Which: separate Dashboard item, or logo as a nav item? |
| 2 | Collapse/expand button always at the very top left | V | *firm* once #3 is chosen |
| 3 | Logo moves: right of the collapse button / top right / bottom of the nav (avatar moves top right) | V | Which of the three? Offer "show me all three". |
| 4 | Collapsed: no rail at all, toggle sits in the top bar, like YouTube | V | Expanded: pushes the page or overlays it? Same at every width? |

## Top bar

| # | Item | Tag | First question |
|---|---|---|---|
| 5 | Divider left of a section label runs the full bar height; divider between label and its tabs is shorter | V | How much shorter: match tab height, or a fixed inset? (their mock: tab height) |

## Welcome card

| # | Item | Tag | First question |
|---|---|---|---|
| 6 | Games only appear while the Magic room is open; closing it empties the cards | B | When should games show: always for your usual room, or for a chosen room (#7)? |
| 7 | Room dropdown on the dashboard to switch rooms | B | Where does it sit: in the welcome card or the games section header? |
| 8 | "Create game" opens the room and the dialog; should only navigate once the game is created | B | After creating, land in the game or the room? |
| 9 | Primary button reads "Go to Magic" (or "Open Magic"), with "Magic" highlighted | V | "Go" or "Open"? Highlight how? |
| 10 | Server name line goes inline with the title | V | Pick a variant from their image (three shown). |
| 11 | Secondary sentence removed (or full width, not wrapped) | V | Remove, or keep at full width? (They lean remove.) |
| 12 | Less padding in the card | V | Three-step mock, or match their chosen variant. |

## Dashboard sections

| # | Item | Tag | First question |
|---|---|---|---|
| 13 | More space above section titles | V | Three-step mock. |
| 14 | Show as many games as fill one row (not two) | V | Fewer than a row: leave the gap? |
| 15 | Filtering; maybe only buddies' games | B | Now or park? (Thinking aloud: park by default.) |
| 16 | "Open seats in Magic" → "Open games in Magic", "Magic" highlighted; remove "closest to starting first" | V | Same highlight as #9? Capital M? |
| 17 | "Hosted by your buddies" → "Buddies games" | V | Exactly "Buddies games" (no apostrophe)? |
| 18 | Empty text → "No games available." | V | Exact text with full stop? |
| 19 | "Recent decks" + "opened in this browser" → "Decks" | V | *firm* |
| 20 | Decks fill the row (not four) | V | Same rule as #14? |
| 21 | Remove "New deck" (or make it open the dialog without navigating) | V / B | Remove? (Keeping it means a B item like #8.) |
| 22 | Remove "All 58 games" and "All decks" buttons | V | *firm* (principle 2) |

## Game card

| # | Item | Tag | First question |
|---|---|---|---|
| 23 | Compact variants without "can chat", watchers etc. | V | Which variant from their image? Which facts stay? |

## Right column

| # | Item | Tag | First question |
|---|---|---|---|
| 24 | Rooms list moves to the top, not the right | V | Top of what: above the welcome card, full width? |
| 25 | "From the server" smaller when collapsed | V | Collapsed shows: title only, or title + first line? |
| 26 | Scroll this area with the mouse wheel on hover | G | Reproduce: does it not scroll today, or scroll the page? |

## Visual errors

| # | Item | Tag | First question |
|---|---|---|---|
| 27 | Card art shows print marks | G | Which screen? Show where they saw it. |
| 28 | Page scrolls under the dark strip instead of behind the top bar | G | Reproduce and show "is this it?" (they said it's hard to explain) |
| 29 | Expand button not centred | G | Measure; centred in the nav column? |

Expected outcome of this round: about 20 Visual/Bug items across 5–6 PRs (left nav, top bar, welcome card, sections, game card, right column + bugs), and 5 Needs developer specs (#6, #7, #8, #15, and #21 if kept).
