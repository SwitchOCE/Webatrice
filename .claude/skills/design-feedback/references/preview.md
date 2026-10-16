# Previews, screenshots and mocks

## The offline harness

URL: `http://localhost:<port>/layout-tests/harness.html?<query>`, with the port from `.design-feedback/server.json` (server started in [setup.md](setup.md)). It renders the real app shell (left nav, top bar, tabs, pages) from seeded data. No login, no game server.

| Query | Shows |
|---|---|
| `route=home` | Dashboard in its empty states (no rooms, games, buddies or recent decks) |
| `route=dashboard` | Dashboard with content: Magic room joined, buddies' and open games, recent decks, long "From the server" message, rooms list, buddies online |
| `route=room` | A room with 403 users and 320 chat lines |
| `route=deck` | Deck editor with an empty draft |
| `route=game&players=2..6` | Game board; add `&as=spectator` to watch instead of play |

Useful crops:
- Whole left nav (logo, toggle, items, avatar): `clip:0,0,76,<height>`. `nav[aria-label="Main navigation"]` is only the item list.
- Collapse button: `button[aria-label="Hide the navigation rail"]` (collapse with `click:` on it; the expand button is then `#nav-rail-toggle`)
- Top bar: `body > #root header` (first `header`); open tabs: `nav[aria-label="Open tabs"]`
- Page content: `main`

**Seed data.** `route=dashboard` seeds a server with 105 people online; four rooms (Magic joined and usual, 58 games, plus Commander, Tournaments, Español); 11 games in Magic in Commander, Legacy, Modern, Pauper and Pioneer, with flags, spectators, a password game and two started ones, three of them hosted by buddies; 4 of 6 buddies online; an announcement long enough to collapse; and 7 recent decks. The seed lives in `packages/webatrice/layout-tests/harness/dashboard.ts`. Card art and the hero image load from Scryfall, so they need network. The dashboard shows only 2 open games and 4 decks because the app limits them, not the seed. When an item needs content that still isn't seeded, add it to `dashboard.ts` on a separate local commit titled `wip: harness seed` and drop that commit before the PR (see [handoff.md](handoff.md)). Keep seeds realistic: names, counts and formats like the designer's screenshots. Tell the designer when a mock uses invented data.

## Screenshots

```bash
node .claude/skills/design-feedback/scripts/shoot.mjs <outDir> "<name>|<query>|<w>x<h>[|dark|light][|<selector>][|<extras>...]" ...
```

Extras, in any order after the size:
- `click:<selector>`, `hover:<selector>`, `press:<key>`, `wait:<ms>`: run in order before the shot, for hover, selected, focus, collapsed or dialog-open states.
- `clip:<x>,<y>,<w>,<h>`: crop to a region instead of an element.
- `scale:<n>`: zoom (pixel density). Use `scale:3` or `4` with a tight `clip:` for changes of a few pixels; at 1× they're invisible.

The script refuses to run if the server on that port is serving a different checkout, so you can't screenshot the wrong code by accident.

- Default sizes: 1440x900 (main), 1280x720 (narrow desktop), 1920x1080 (wide). Use the widths the spec lists; default to 1440x900 dark.
- Name shots `<item#>-<what>-before` and `<item#>-<what>-after`, in `.design-feedback/<session>/shots/`.
- Light theme too when the change touches colour, borders or backgrounds.
- **Current means the unchanged app.** Take every Current shot you may need in Step 1, before any code change: full page for each route involved plus the areas the items touch. Once you've edited code, the harness shows your edits. For a Current crop you didn't take, crop the full-page Current PNG instead: `HARNESS_URL=file:///<abs path>/<full>.png node … "<name>||<w>x<h>|clip:x,y,w,h"`.
- Make before and after pairs identical in route, size, theme, crop, scale and steps.
- For spacing, alignment and size changes, measure in the page (`getBoundingClientRect`) before and after, and put the numbers in the caption and the spec's "Done when" ("was 0px left / 12px right; now 5.5px each side"). Remember borders when judging "centred".
- Look at every screenshot yourself before showing it. If it shows a loading screen, the login page or an error, fix the shot first.

## Wireframes

For structure and option choices, before any code change.

- One HTML file per item in `.design-feedback/<session>/mocks/<nn>-<slug>.html`, self-contained (inline CSS, no external requests).
- Left column: the **Current** screenshot (`<img>` with a relative path), cropped to the same region the wireframe frames show and displayed at 1:1 (fixed `width`/`height` in px, not `width: 100%`). Right: **Proposed** (or **A / B / C** for options), drawn at the same scale.
- Draw with neutral grey boxes, 1px borders, the app's real words, and the real sizes where they matter (nav widths, card sizes). Highlight only what changed, with a numbered marker that matches the spec line it implements.
- Render it to PNG for the conversation:
  `HARNESS_URL=file:///<absolute path to mock.html> node .claude/skills/design-feedback/scripts/shoot.mjs <outDir> "<name>||1600x900"`

For a quick either/or, an ASCII sketch in the AskUserQuestion `preview` field is often enough:

```
┌──┬─────────────────────────────┐
│☰ │ Lobby │ Magic ▸ │ My decks  │
├──┴─────────────────────────────┤
```

## Real-app mocks

For final sign-off of Visual and Bug items.

1. Make sure you're on the item's design branch ([handoff.md](handoff.md) step 1).
2. Make the change. Vite reloads the harness on save.
3. Retake exactly the shots you took for **Current**, with `-after` names, plus every state and width the spec lists.
4. Check the diff of the screenshots yourself against the spec's "Done when" before showing the designer.

## Showing the designer

Build one comparison page per round: `.design-feedback/<session>/review.html`, one row per item: title, the spec's "Change" and "Done when" lines, then Current and Proposed images side by side at the same width.

Present it, in order of preference:
1. If the Artifact tool is available, publish `review.html` as a private artifact (follow that tool's design guidance; images go in as supporting files) and give the designer the link. Republish to the same file on every revision so the link stays the same.
2. Otherwise send the PNGs with SendUserFile (`display: render`), one message per item.
3. Otherwise open `review.html` in the built-in browser pane, or give its path.

Always show Current and Proposed together. Never show a Proposed image alone.
