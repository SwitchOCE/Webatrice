# Brilliant mode

For designers who'd rather show than tell. You build the real screen in Brilliant (the designer's design app) as native, editable frames; the designer edits it there, by hand; you read back exactly what changed and turn it into the item's spec. It replaces the wireframe step and much of the clarifying; it never replaces the real-app mock and sign-off.

Use it when the designer asks, when they say they work in Brilliant, or offer it when an item is about layout or spacing that's easier to drag than describe. Copy and behaviour items don't need it.

## Token rules (important)

Brilliant's MCP server returns very large payloads (tens of KB per call). **Never register it as an MCP server and never call its tools directly.** Use only the scripts below: they do the heavy lifting on disk and print a few lines. Don't open the `.html`, `.json` or `init-docs.md` files they write unless something breaks.

## Setup (once per machine, then at the start of each Brilliant round)

```bash
node .claude/skills/design-feedback/scripts/brilliant/check.mjs
```

- `READY` → carry on.
- `NOT READY: can't reach…` → tell the designer: "Open Brilliant and turn on its MCP server in Brilliant's settings, then tell me." Run it again after.
- `CHOOSE` → ask which Brilliant project to use (or to create one called "Webatrice"), then `check.mjs --project "<name>"`.

The offline preview server must be running ([setup.md](setup.md)).

## 1. Push the current screen

```bash
node .claude/skills/design-feedback/scripts/brilliant/push.mjs --round <round> --name "<Screen / Area>" --route <query> --selector "<css>" [--size 1440x900] [--theme dark] [--steps "click:<sel>"]
```

- One frame per area the items touch, named like `Dashboard / Buddies games`. Selectors are in [preview.md](preview.md); a section usually works best (`section[aria-labelledby="home-buddy-games"]`, `main`, the rail via its wrapper). Whole pages work but are slow to edit; prefer areas.
- It lands on the canvas `Design feedback/<round>` in the chosen project, and prints the frame id, element count, and two PNG paths: the app and the Brilliant render. **Look at both** before telling the designer it's ready. If they differ visibly, say what differs in one line.
- `--replace` pushes again over the previous frame of that name. It deletes the old frame, **including any designer edits**, so only use it before the designer has started editing, or with their OK.

Then tell the designer, in one or two sentences: which canvas and frame to open, that they can edit anything (text, spacing, colours, delete or move things), and to **duplicate the frame for alternatives** rather than editing one frame into several options. Ask them to say "done" when finished.

## 2. Read back the changes

```bash
node .claude/skills/design-feedback/scripts/brilliant/frames.mjs --round <round>
node .claude/skills/design-feedback/scripts/brilliant/diff.mjs --round <round> --name "<Screen / Area>" [--frame <id>]
```

`frames.mjs` lists the pushed frames and any new ones (the designer's copies), with the exact `diff.mjs` command for each. Diff every frame the designer touched.

The diff prints one line per change, in plain terms:

```
TEXT Dashboard / Buddies games: "Hosted by your buddies" → "Buddies games"
REMOVED "in Magic, open seats first" from Dashboard / Buddies games
CHANGED Row 1 › Card: Legacy, Saffi hosting › Header: padding 16,16,12,16 → 12 [in 1 of 3 similar items (this one: Card: Legacy, Saffi hosting); ask whether it applies to all]
```

How to use it:
- Each line becomes a spec line (or a question). Values are exact: padding `16,16,12,16` is top, right, bottom, left in px; colours are hex; sizes are px or `fill` / `hug`.
- `[in 1 of N similar items …]`: the designer edited one card, list row, etc. In the code that's one shared component, so **ask** "Should every game card get this, or only this one?" Default answer: all of them.
- `ADDED` lines are new elements; ask what they're for if it isn't obvious (a new button is usually a Behaviour item).
- `MOVED` / `REORDERED` are order changes; confirm the intended order in words.
- Several frames (copies) = options. Ask which one they want, or whether each is a separate item.
- Fixed numbers in the push (e.g. a card's width) came from a 1440px window. If the designer resized a card, ask whether it should grow with the window or stay that size.
- If the diff is very long (they rebuilt the area), don't translate it line by line: export what they made (`push` PNGs are in `.design-feedback/<round>/brilliant/`), describe the change in a few sentences, and confirm.

Then read the spec back as usual (SKILL.md Step 2) and continue with the real-app mock (Step 3). Mention in the PR body that the change was specified in Brilliant, with the diff lines.

## Notes

- Brilliant must be open on the designer's machine; the scripts talk to it at `http://127.0.0.1:3333/mcp` (override with `BRILLIANT_MCP`).
- A frame with a one-sided border becomes an outer frame plus a 1px line; edits to the outer frame show as changes to it (e.g. "padding none → 12"), which is still correct.
- Icons and country flags come in as vector shapes; text uses the app's fonts (Space Grotesk, Inter).
- If PNG export fails (Brilliant minimised), the scripts fall back to rendering Brilliant's SVG export, so the images still appear.
- State lives in `.design-feedback/brilliant/` (config, session, usage log) and `.design-feedback/<round>/brilliant/` (snapshots and images).
