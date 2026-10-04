# Task wr5r: PR R5, `refactor(layout): split TopBar`
Push branch: `claude/parity-r5-topbar`. PR file: `parity-r5-topbar`. Base: `fork/claude/restack-25a-platform-prefs` @ 40aa071c (the wR4a 25a row: 25a/26/27/28 restacked, all of which edit TopBar).
Spec: `/tmp/notes/specs/aud2.md` (the architecture audit). Follow the refactor idioms of PR 05/09: characterization specs first (pin current behaviour and request shapes before moving code), then move, then delete. No behaviour change unless the audit names a bug; list any such fixes separately in the PR file. Every commit typechecks. Gate: the full gate plus webatrice e2e on all browsers.
Implement the aud2 TopBar row:
- **Sticky-tab store:** the module singleton, `useSyncExternalStore` and `localStorage` move to `hooks/` or `services/` with specs.
- **Last-route persistence:** move it out of the view; `AppShell` stops importing from TopBar.
- **Components:** extract `UserMenu` and the tab strip as components.
- **Deck-list fetch:** use the shared one if R3 has landed; otherwise leave a TODO naming R3.

Keep PR 26's Menu/focus behaviour, PR 27's nav semantics and PR 28's render-time titles, all pinned by their existing specs.
