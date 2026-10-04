# Task wr1r: PR R1, `refactor(game): one card-ops and targeting seam`
Push branch: `claude/parity-r1-card-ops-seam`. PR file: `parity-r1-card-ops-seam`. Base: `origin/claude/restack-17b-game-menus` (41f0d47, the 17b tip from w17r).
Spec: `/tmp/notes/specs/aud2.md` (the architecture audit). Follow the refactor idioms of PR 05/09: characterization specs first (pin current behaviour and request shapes before moving code), then move, then delete. No behaviour change unless the audit names a bug; list any such fixes separately in the PR file. Every commit typechecks. Gate: the full gate plus webatrice e2e on all browsers.
Implement aud2 §4 R1 in full, plus duplicates D1 and D2 from §3:
- pure `battlefieldSelectionOps.ts` + `useBattlefieldCardOps.ts`, shared by `BattlefieldCardMenu` and `useSeatShortcutOperations`. The shortcut hook becomes a table keyed by ActionId with seat-context input;
- `buildOpponentCardMenu` joins the model;
- `PlayerTargetCommands` gains judge wrapping and arrow colour;
- `arrowResolution.ts` + `useArrowDrag.ts`, with one pending-target owner (fold in `usePendingArrows`).

`useGameArrowInteractions` must stop calling `webClient` directly (a layering violation). If it isn't already, add a lint rule that forbids `webClient` imports under `features/game/components` and `features/game/hooks`, except in the port modules.

Characterization first: pin the request shapes of all seat action ids and both arrow paths.
