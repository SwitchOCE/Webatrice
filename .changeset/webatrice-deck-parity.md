---
'@cockatrice/webatrice': minor
---

The deck pages catch up with desktop's deck editor and deck storage:

- **Folders.** My Decks shows the server's folder tree one folder at a time, with a breadcrumb. You can create and delete folders (deleting says how many decks go with it), create or import decks into a folder, move a deck to another folder, and download a deck or a whole folder as `.cod` files.
- **Undo and redo.** Every card and metadata edit can be undone and redone, from the buttons, from Ctrl+Z / Ctrl+Y (rebindable in Settings → Shortcuts), or by jumping through the history list.
- **Legality.** Cards that are banned, not legal or over the allowed count in the deck's format are shown in red, with a summary in the sidebar. Imported format rules (allowed counts and exceptions) apply; cards or formats with no legality data say so instead of being flagged.
- **Banner card and tags** can be edited in the sidebar; unknown tag data in the file is kept.
- **Sample hand** with an adjustable size and redraw.
- **Print deck**, **Create decklist** on decklist.org / decklist.xyz, and **Analyze** on deckstats.net / tappedout.net. "Load deck from online service" recognizes Archidekt, Deckstats, Moxfield and TappedOut links; those sites don't let a web page read decks, so it opens the site's export for you to paste.

Autosave now uploads only when the deck actually changed (it used to upload on every scheduled save), goes through Sockatrice's `deckUpdate`, and reports a failed save with a Retry link.
