# wR3 status
- 23:42Z started; fetched branches → row 1 (26) onto restack-17b
- 23:58Z row1 (26) replayed onto 17b 65687b0 with folds (0a0ab4d spec+542cf5d into f6ac60e, 36cd584 split, 08393d9 folded), pushed claude/restack-26-a11y-primitives → per-commit check running
- 00:07Z row1 (26) per-commit check all green (tc/lint/i18n), integration green at f6ac60e replacement → row 2
- 00:07Z row2 (27) replayed, 94a1ecb folded into baf3b91, GamesList coverage port as test commit right after; pushed claude/restack-27-a11y-keyboard-paths → per-commit check
- 00:41Z row2 (27) per-commit check green (tc/lint/i18n + rooms integration); row3 (28) in progress: 4/16 picked. Added fix(game) ICU commit before the i18n:check gate (TallyOverlay.selectedCount used {{count}}, rejected by the gate).
- QUESTION Q1: integration/src/features/game/invite-link.spec.tsx 'Back returns to the room' is flaky ON THE BASE restack-17b 65687b0 (2/5 fails: MUI confirm dialog still aria-hides the page during its exit transition). One-line fix: waitFor dialog gone before clicking back (8/8 green). It belongs in 17b (w17r). | default: I add it as a standalone test(game) commit at the end of row 3 (28) so the gate is reliable; move it into 17b if you prefer.
- 00:42Z ACK M1: rebased rows onto restack-17b 41f0d47 (only e2e/fixtures/network.ts changed; no conflicts). New tips: 26 bdb3f2e, 27 6e1fd25, force-pushed (with lease); e2e typecheck+lint ok at both → continue row 3 (28)
