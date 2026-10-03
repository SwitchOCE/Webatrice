# Task rv8: review the PlayerBox refactor (PR 05, stages 1–4)
Follow /tmp/notes/tasks/review-template.md. Task id: rv8.
- **05** `origin/parity/05-refactor-seat` at 0412500 (parent: `origin/parity/06-e2e-hardening` d2e3d1e), PR file parity-05-refactor-seat. It has 53 commits.

Judge it as a reviewer of a large behaviour-preserving refactor would:
- **Is behaviour really unchanged?** Sample the riskiest moves: drag/drop, zone views, prompts, menus, and the request payloads.
- **Characterization coverage.** Does it actually pin the moved behaviour?
- **New owners.** Are their boundaries clean, consistent with `docs/webatrice-solid-refactor-plan.md`, and free of over-abstraction?
- **Dead code** left behind.
- **Commit hygiene.** Can each commit be reviewed and does each one build?
- **Deliberate behaviour changes.** The PR lists them (GAME-018, multiple zone views open at once). Are they justified and isolated?

Stage 5 (Phases 7–8) is running in parallel. Focus on stages 1–4.
