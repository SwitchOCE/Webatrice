# Task fr2: rebase R2 onto fixed 25b and apply rv19
Branch: `origin/claude/parity-r2-zone-view-family`. Review: /tmp/notes/reviews/rv19.md. Fix rules: /tmp/notes/tasks/fix-template.md.

1. **Rebase first.** Move R2 onto f25b's 25b tip: `git rebase --onto origin/claude/parity-25b-board-prefs af3cfc1 origin/claude/parity-r2-zone-view-family` (plain rebase, not `-i`).
   - Resolve every conflict as **f25b behaviour + R2 structure**: f25b's `contentsHeight` expand cap, keyboard expand button and initial/expanded rows live inside R2's shared `useFloatingPanelGeometry` / `ZoneViewPanel` layout.
   - Fix the silently-merged but broken `ZoneViewDialog.spec.tsx` that rv19 describes.
   - Regenerate `i18n-default.json`. Every commit must typecheck.
   - Push with `--force-with-lease`.
2. **Then apply rv19 as new commits:**
   - Test size persistence for real: a controllable `ResizeObserver` stub in the spec, debounced write, and no store on the first observation. Kill M4.
   - Pin the reopen-on-new-reveal path fully: re-centre/clamp and the `hasBeenDragged` reset. Kill M5 and M15.
   - Make the "viewport wins" clamp real in the browser: drop the CSS min that overrides it, or reword the claim. Add a spec where the min exceeds the viewport.
   - Add a spec for the ungrouped grid fallback (kill M22).
   - Translate the reveal and top-N titles as whole messages with interpolation, not concatenation.
   - All nits.
   - Re-run all 24 mutants and report the table in the PR file.

Gate: the full gate plus webatrice e2e on all browsers.
