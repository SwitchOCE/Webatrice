# Task wr6r: PR R6, `refactor(datatrice): split game listeners by domain`
Push branch: `claude/parity-r6-game-listeners`. PR file: `parity-r6-game-listeners`. Base: `origin/claude/parity-25b-board-prefs` (af3cfc1; 25b touches the arrow sweep).
Spec: `/tmp/notes/specs/aud2.md` (the architecture audit). Follow the refactor idioms of PR 05/09: characterization specs first (pin current behaviour and request shapes before moving code), then move, then delete. No behaviour change unless the audit names a bug; list any such fixes separately in the PR file. Every commit typechecks. Gate: the full gate plus webatrice e2e on all browsers.
Implement the aud2 `game.listeners.ts` row:
- per-domain listener modules: cards, zones, counters, arrows, players, phases;
- break `cardMoved` into its six named jobs, each a pure helper with table specs;
- keep the registration order and action sequence identical (pin it with a characterization spec that records the dispatched actions for a scripted event stream).
