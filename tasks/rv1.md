# Task rv1 — review PRs 01, 02, 03
Follow /tmp/notes/tasks/review-template.md. Task id: rv1.
- 01 `origin/parity/01-lint` (parent: `origin/master`) — PR file parity-01-lint. It's a large mechanical sweep: focus on the non-mechanical commits (react-hooks fixes, the 2 bug fixes, TopBar move, CI) and sample the mechanical part for semantic changes hidden in it.
- 02 `origin/parity/02-hand-reorder` (parent: `origin/parity/01-lint`) — parity-02-hand-reorder.
- 03 `origin/parity/03-protocol` (parent: `origin/parity/02-hand-reorder`) — parity-03-protocol. Check every 3.1 builder against `libcockatrice_protocol` at add65caa (field numbers, defaults, response handling) and the ServerCapability gating design.
