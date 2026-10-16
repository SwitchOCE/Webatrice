# Clarifying feedback until it is firm

Goal: every line of the item spec (SKILL.md, Step 2) filled in without guessing. Ask only what the spec still needs; don't ask what a screenshot already answers.

## How to ask

- AskUserQuestion, one item at a time, up to 4 questions per call.
- Options are concrete and visual: "Same size as the other nav icons (24px)", not "Option 1". Recommendation first, marked "(Recommended)", based on the designer's own principles below.
- When the answer is a picture, mock it: offer "Show me all three" as an option and wireframe them side by side.
- If the designer answers "you decide", pick, say what you picked in one line, and carry on. They'll see it in the mock.
- Echo the spec back after the last answer: "So: … Right?"

## Checklist by kind of change

**Position / layout**
- Exactly where: anchored to what, aligned with what, before/after which element?
- What happens to the space it leaves, and to the things around it?
- Does it change at narrow (1280) or wide (1920+) windows?

**Size / spacing**
- A value (px) or "same as <other element>"? Prefer "same as" — it keeps the app consistent.
- Which sides (top only, all round, between items)?
- For "more" / "less": offer three steps as a mock (e.g. 8 / 16 / 24px) and let them pick.

**Words on screen**
- The exact text, including capitals and punctuation. Say it back character for character.
- Which parts change with data (room name, counts, player names)? How is each shown: plain, bold, accent colour, chip?
- What if it's too long: cut with "…", wrap, or shrink?
- Note to self (don't burden the designer): only the English text changes; other languages catch up later.

**Removing something**
- Gone in every state, or only some (empty state, collapsed, small windows)?
- What takes its place: nothing, close the gap, or something else?

**Look (colour, type, border, icon)**
- "Like <existing element>" if possible; otherwise which existing app colour or text style. Avoid new colours.
- Both light and dark theme?

**States** — ask about each that applies: hover, selected/current, keyboard focus, disabled, empty, loading, collapsed/expanded, dialog open.

**Behaviour** (tag: Needs developer) — what triggers it, what happens, what if the person cancels, where do they end up, what do they see while waiting.

## Patterns in the designer's feedback, and the question each needs

Examples are from the designer's first document (16 Oct 2026, dashboard and nav). See [../examples/2026-10-16-dashboard.md](../examples/2026-10-16-dashboard.md) for the whole document split into items.

| Pattern | Example | Ask |
|---|---|---|
| Options with no pick | Logo: right of the collapse button / top right / bottom of the nav (and move the avatar) | "Which one?" with "Show me all three" as an option. |
| Either/or rule | "Dashboard gets its own nav item… if you keep the logo as the nav item it needs the same behaviours" | "Which do you want: a separate Dashboard item, or the logo acting as one?" Then the details of that branch only. |
| Points at another product | "Refer to the way the YouTube side nav works" | Name the specific parts: collapsed = no rail at all, toggle sits in the top bar; expanded = pushes content or overlays it? Confirm with a wireframe, not words. |
| Relative amount | "Padding for this section can be decreased"; "increase padding above section titles" | Three-step mock, or "same as <element>". |
| Fuzzy count | "Enough games to fill a row"; "decks until they reach the width of the screen" | "As many as fit in one row at the current window width, so more on wider screens?" Plus: what if there are fewer? what replaces the hidden ones (they asked to remove "All games")? |
| Thinking aloud | "Maybe open seats won't work and we should only have buddies' games?"; "We should also add filtering options?" | "Is this a change you want now, or an idea to park?" Park by default. |
| Approximate copy | "Something like: No games available." | "Exactly 'No games available.' — with the full stop?" |
| Emphasis in copy | "The word 'Magic' should be highlighted" | Magic is a room name, so it changes with the room. "Highlighted how: accent colour, bold, or a chip like the format tags?" Show the three. Also confirm capitals ("Open games in Magic"). |
| Removal | "I don't think the server title is needed"; "secondary text… not needed at all" | Confirm "remove" vs "move" (they also said "server info can go in line with the title"). |
| Hard to explain | "Scroll error… hard to explain, DM me" | Reproduce it in the preview and show a screenshot or short step list: "Is this it?" If not, ask for a screen recording or the exact steps. |
| Visual + behaviour in one | "Create game navigates to the room and opens the dialog; it should only navigate once the game is created" | Split: the behaviour is Needs developer; any label or style change is a Visual item. |
| Several suggested variants in an image | Three space-saving versions of the welcome card | "Which variant?" with each as an option, with the image region as reference. |
| Bug report | "Expand button not centred" | Measure it in the preview first. Confirm the target: centred horizontally in the nav column? vertically with the logo row? |

## Designer's words → app areas

Use the designer's words back to them. Map internally:

| Designer says | Means |
|---|---|
| left hand nav, side nav, rail | The vertical nav on the left (Play, Decks, Replays, People, Settings; logo on top; avatar at the bottom) |
| top nav | The bar across the top: section labels, open tabs, notifications |
| section title / tab title | In the top bar: the small caps label ("GAMES", "My decks") / each open tab ("Magic", "Deck 1") |
| dashboard, title dashboard card | Home page / the welcome card at its top |
| lobby, Magic, room | A server room; "Magic" is one room's name |
| right hand dashboard | The right column on home: "From the server" and the rooms list |
| game card | A game tile in the dashboard's games sections |

## Principles seen so far

Seed for `.design-feedback/principles.md`. Check every proposal against these.

1. A button does one thing. Opening a dialog doesn't also navigate; navigation happens only after the action completes.
2. Don't repeat navigation the left nav already gives ("All games", "All decks", "New deck" buttons on the dashboard).
3. Save vertical space; drop text that doesn't help a decision.
4. Anything that acts as a nav item looks and behaves like the other nav items: same size, hover and selected states, same column.
5. Collections fill the available width instead of stopping at a fixed count.
6. Room names are highlighted as names wherever they appear in sentences.
7. Short, plain labels: "Decks", "Buddies games", "No games available."
8. Dividers have meaning: a full-height line separates sections; a shorter line separates a section label from its tabs.
