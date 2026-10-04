# Task fr1: apply rv20 to PR R1
Follow /tmp/notes/tasks/fix-template.md, with this branch mapping: the PR branch is `origin/claude/parity-r1-card-ops-seam` (2f6e5b6), and the parent stays 41f0d47. Review: /tmp/notes/reviews/rv20.md. No history rewrite: new commits on top. w17c is building on 2f6e5b6 and will rebase onto your tip, so keep the seam's API stable where you can and list any API change in status.

Apply every major and minor (and the nits):
- **Draw arrow… from hand:** play respects `playToStack` exactly like desktop (`arrow_item.cpp:434-446` → `playCard(false)` → `player_actions.cpp:72-80`). Route it through the same play helper. Spec both settings.
- **Pending-target pointer:** move it out of the context value into an external store read with `useSyncExternalStore` by the overlay that draws it. Add a render-count spec proving that other seats don't re-render on mousemove.
- **attachCard shortcut:** anchor on the first selected card with a numeric id, as before. Spec it.
- **Delete the fourth "increment all counters" copy** in `useBattlefieldMenuItems`. Use `cardOps`. Grep again for any other duplicate, so that the "one implementation per op" claim is true.
- **Tap/Untap:** add the untap direction in both specs. Kill the mutant.
- All minors and nits as the review proposes.

Gate: the full gate plus webatrice e2e on all browsers.
