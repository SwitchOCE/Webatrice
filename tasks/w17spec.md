# Task w17spec — design spec for PR 17 (game actions), read-only research

Push branch: none for code. Deliver only `specs/w17.md` on your notes branch `claude/notes-w17spec` (plus status.md).

Context: PR 17 will close GAME-021/023/027/028/029/030 (see `/tmp/notes/game-gaps.md` for each row's text), plus reveal-to, hide, related cards, Say macros via `useMessageMacros`, a shortcut catalogue, and two pinned bugs from refactor stage 2 (card id 0 has no "Transform into"; P/T sort leaves non-creatures unsorted). It will be built on the refactored game seat: `origin/parity/05-refactor-seat` (stage 4 is in flight on `claude/parity-05-refactor-seat`; read that branch if it has newer commits, otherwise 1ef4dab). Read `/tmp/notes/prs/parity-05-refactor-seat.md` and `/tmp/notes/docs/webatrice-solid-refactor-plan.md` for the new owners.

For each item, write in specs/w17.md:
- the desktop behaviour (file:function in `cockatrice/src`, exact menu labels, shortcuts, command payloads, confirmation flows);
- the protocol pieces (existing Sockatrice builders or missing ones, Datatrice state);
- where it lands in the refactored seat (which owner/hook/menu builder), with file paths;
- tests to write (unit/integration/e2e) and an estimate (S/M/L);
- a suggested split into commits, and anything that would conflict with the remaining refactor stage 5 (Phases 7–8 of the plan).

Keep it under ~600 lines. Do not run the gate; don't push code.
