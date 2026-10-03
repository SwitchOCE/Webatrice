# Webatrice audit limitations

Audit date: **2026-08-24 (Australia/Sydney)**

Related: [Current state](current-state.md) · [Cockatrice parity matrix](cockatrice-parity-matrix.md) · [Agent onboarding](agent-onboarding.md)

## Repository and baseline limitations

- Webatrice's vendored Cockatrice checkout is sparse and contains protocol definitions only. The audit therefore created a separate shallow checkout of canonical Cockatrice at `a571a9aa04796915db172e2e60280ecbd5ec8926`.
- The Cockatrice checkout has only the default branch tip and shallow history. Current source is available, but older commit archaeology, blame depth and historical intent are limited.
- Servatrice is the `servatrice/` subtree of the same Cockatrice repository; it was consulted only for protocol/server-controlled discrepancies, not audited as a product.
- Cockatrice/Servatrice C++ and Qt binaries were not built or run. Desktop behavior claims are static-source findings unless a Cockatrice test is cited.
- The audit describes two independently current default-branch commits. Webatrice's pinned sparse submodule is older (`63143f941643dc2f46f658cb51ea3b5727da3e56`), so newly changed desktop/protocol behavior can differ from the client pin.

## Build and test limitations

- Root lint fails in Webatrice with 3,555 errors and 12 warnings. This reduces confidence in layer boundaries and obscures newly introduced lint regressions.
- Unit tests pass but emit React `act(...)`, selector memoization, and module-type warnings. Passing counts should not be read as warning-free test health.
- Two Webatrice unit tests and two Webatrice integration tests are skipped. Their behavior was not established by those suites.
- Coverage commands were not run; no percentage or untested-line claim is made.
- The first typecheck/build attempts were blocked by Codex sandbox filesystem ownership/access controls. Both passed when rerun outside those restrictions with process-local Git configuration; the failures are environmental, not source failures.
- `npm install` ran with npm 11.17.0 rather than the declared npm 10.9.4 and rewrote lockfile metadata; that generated diff was restored. npm also warned that four dependency install scripts were not approved by its allow-scripts policy.
- The Docker-backed suite passed, but its eight tests are a focused smoke/migration-safety set rather than exhaustive parity coverage. It does not exercise forced disconnect/recovery, server errors, account maintenance, replay, moderation/administration, sideboarding, or most specialized gameplay actions.
- The development server was observed through a localhost HTTP 200/title probe; the e2e suite separately exercised a production preview against local Dockerized Servatrice. No production credentials, public host, replay service, or production deployment was exercised.

## Browser and environment limitations

- Browser scope is desktop only. Mobile, tablet, touch-specific and responsive behavior are explicitly out of scope and are not parity gaps.
- Playwright config contains only desktop Chromium. Six Chromium scenarios passed, including foreground worker keepalive, IndexedDB known-host persistence, local deck-file selection, gameplay and spectating. Firefox and Safari behavior—including drag/drop, popup/BroadcastChannel behavior, IndexedDB migrations, downloads and file pickers—remains unverified.
- The 60-second browser connection soak kept the page in the foreground. Background-tab throttling, page freeze, BFCache restoration and `beforeunload` cleanup were not exercised.
- No formal browser-support statement or minimum-version policy was found at the baseline. Vite's output target and successful Chromium-oriented build are not a substitute for a support matrix.
- No assistive technology, screen reader, keyboard-only end-to-end, automated accessibility scanner, contrast audit, zoom or reduced-motion test was run. Source-level ARIA/keyboard evidence does not establish WCAG conformance.
- Popup blockers, third-party cookie/storage policy, private browsing quotas and corporate browser restrictions were not tested.

## External-system and credential restrictions

- No production Servatrice service was contacted and no real credentials were used.
- Scryfall image/card lookups, pricing providers, Google Analytics, Transifex translation retrieval and other external URLs were not exercised. Their source integrations were inspected only where relevant.
- Email delivery for registration/activation/password reset was not tested; only command/UI paths and automated fakes were available.
- Local `.cod` deck selection/submission was exercised in Chromium. Deck/replay downloads, general export/download UX, large files and error/cancellation paths were not exercised.

## Inference and confidence boundaries

- A feature is `Missing` only after searches of plausible Webatrice UI, hooks, state, protocol commands/events, tests, flags and alternate workflows. When transport/state exists but no complete UI was established, the matrix normally uses `Partial` rather than `Missing`.
- `Unverified` is used when source names or protocol support suggest capability but the available evidence cannot establish a usable workflow.
- User impact, priorities and recommended increments are planning judgments. They are informed by Cockatrice's visible workflows and Webatrice architecture, not usage analytics or user research.
- Source inspection establishes that an event handler or command exists; it does not prove a live server emits compatible data at this pair of commits.
- Passing unit/integration tests use mocked WebSocket construction and no real Servatrice. The separate e2e suite establishes the eight cited local real-server/browser scenarios, but must not be generalized to untested deployment, recovery or parity behavior.
- UI differences are not marked gaps when the browser implementation preserves the complete capability with equal or better interaction. Materially reduced behavior remains a parity gap regardless of visual quality.

## Unresolved questions

1. Which exact Chrome, Edge, Firefox and Safari versions are maintainers willing to support and gate in CI?
2. Does transport reconnection successfully reauthenticate and restore joined rooms/games against current Servatrice, or only reopen the WebSocket?
3. Should the browser client advertise the stale `webclient-1.0 (2019-10-31)` version string, and do any servers gate behavior on it?
4. Which server-stored deck/replay/admin protocol surfaces are intentionally deferred versus expected in the next parity milestone?
5. Are the unregistered `ADMINISTRATION` and `REPLAYS` route constants placeholders, removed routes, or active near-term commitments?
6. What is the intended persistence contract for local decks across browser profiles, storage eviction and IndexedDB migrations?
7. Should desktop replay files be parsed locally in the browser, requested from Servatrice, or both?
8. Which accessibility standard and testing tools should become release gates?
9. Is the current root lint failure accepted temporary revamp debt, and when should Webatrice lint be added to `.github/workflows/ci.yml`?
10. Is parity evaluated against Cockatrice tip, Webatrice's pinned submodule commit, or a coordinated release pair when protocol behavior changes?

## Explicitly out of scope

- Mobile/tablet layout, responsive breakpoints, touch gestures and app-store packaging.
- A general Servatrice architecture, security or operations audit.
- Production deployment, live-service performance, penetration testing, privacy/legal review and credential handling review beyond visible client storage paths.
- Implementing, refactoring or fixing application code. Only documentation and audit-planning files were changed.
- Visual redesign implementation. The audit records parity-safe UI/UX opportunities in the [parity matrix](cockatrice-parity-matrix.md).
