# Task fr6: apply rv18 to PR R6
Follow /tmp/notes/tasks/fix-template.md, with this branch mapping: the PR branch is `origin/claude/parity-r6-game-listeners`, and the parent stays af3cfc1. Review: /tmp/notes/reviews/rv18.md. No history rewrite: new commits on top.

Apply every finding:
- **Majors:**
  - Make `getArrowsTouchingCard` a non-exported state scan (memoized if it stays a selector), drop the `ArrowRef` public export, and keep the changeset as `patch` only if no public API remains; otherwise make it `minor`.
  - Pin all four same-zone reorder zones (HAND, STACK, GRAVE, EXILE) in `cardMove.spec` and the characterization stream. Prove it by mutation: removing any one zone must fail a test.
- **Minors:**
  - `describeCard` compares against schema defaults.
  - Add a face-down optimistic patch row.
  - Pin undo-draw name precedence.
  - Make `carryForwardResyncState` return data (or reword the claim).
- **Nits.**

Re-run the mutation probes rv18 lists and report each one killed. Gate: the full gate (e2e only if UI-facing code changed).
