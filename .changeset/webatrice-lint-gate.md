---
'@cockatrice/webatrice': patch
---

Make the Webatrice lint gate pass and enforce it in CI.

**Auto Connect now saves.** Ticking *Auto Connect* on the login form had stopped persisting the preference, so it reset on the next visit. The checkbox is wired back to its persist handler.

**Deck autosave after switching decks.** If the editor moved straight from one deck to another without unmounting, the debounced autosave kept the first deck's id and could save edits under the wrong deck. It now always targets the open deck.

**Lint.** `eslint-plugin-react-hooks` is installed (`rules-of-hooks` as an error, `exhaustive-deps` as a warning), every finding has been fixed or annotated, overlong lines are reformatted, and `TopBar` moves into page chrome so no shared layer imports a feature. CI now runs `npm run -w @cockatrice/webatrice lint`.
