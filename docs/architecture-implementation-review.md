# Webatrice architecture and implementation review

Point-in-time review: **2026-08-24 (Australia/Sydney)**

Reviewed Webatrice commit: `cfdf276368f6663db71a952665fafb0adee307ec`

Related reports: [current-state assessment](current-state.md) · [Cockatrice parity matrix](cockatrice-parity-matrix.md) · [agent onboarding](agent-onboarding.md) · [audit limitations](audit-limitations.md)

## 1. Executive summary

### Overall assessment

Webatrice has a sound high-level decomposition and substantially more verification than a typical browser port at this stage. Sockatrice owns generated protobuf commands, event dispatch, correlation, WebSocket lifecycle, and keepalive; Datatrice owns normalized server, room, and game state; Webatrice owns browser persistence and React UI. The direction of the principal runtime flow is intelligible, most cross-package responsibilities are documented, TypeScript currently passes, and recent unit, integration, build, and real-Servatrice browser results provide a strong base.

The primary risk is that the architecture is better enforced in Sockatrice and Datatrice than in Webatrice. The app's quality gate is red and omitted from CI, its React Hooks rule is referenced but not installed, declared UI boundaries are already crossed, and several route/game modules have grown into very large change surfaces. A code-generating agent can therefore produce compiling, well-tested code that still violates the intended dependency direction or misses a stale-effect defect.

The most important runtime weakness is connection and command recovery. The socket layer advertises exponential reconnect, but the authentication options are consumed during the first server-identification handshake. A replacement socket receives server identification with no pending options, changes status to disconnected, and closes. Separately, pending commands have no deadline or cancellation result; disconnect clears their callbacks without notifying callers. Recovery is thus not an end-to-end session contract.

No **P0** issue was established. This is not a claim that production security or operations are P0-free: production headers, live deployment configuration, penetration resistance, and real forced-drop behavior were outside the available evidence.

### Five most important risks

1. **REL-001 — reconnect is not authenticated recovery.** A transient disconnect can enter a reconnect UI state, open a new socket, and then deterministically fail the new handshake because connection options were consumed.
2. **QUAL-001 — the application quality gate is both red and absent from CI.** Current app lint has 3,555 errors; three are dependency-boundary violations, and eleven are references to an unavailable Hooks rule.
3. **REL-002 — commands do not have a total outcome contract.** There is no timeout, cancellation result, or disconnect rejection for pending callbacks, so loading states and optimistic changes can remain unresolved.
4. **ARCH-001 — app boundaries are eroding around oversized orchestration modules.** `PlayerBox.tsx` is 11,058 lines and directly reaches into the decks feature; a shared `TopBar` imports route features.
5. **DATA-001 — automatic bracket assessment conflates remote failure with valid empty data.** It also sends a complete deck list to a third-party service without an explicit integration/trust contract.

### Principal architectural strengths to preserve

- The three-workspace split reflects meaningful ownership rather than packaging for its own sake: generated wire behavior is isolated from normalized state and from browser UI.
- Protobuf bindings are generated from vendored Cockatrice definitions, and the Datatrice instructions capture difficult proto2/proto3 presence, Immer, and hidden-information invariants.
- Redux session state, IndexedDB persistence, and `localStorage` shell preferences are intentionally separated.
- The test pyramid is broad: co-located unit/component tests, protobuf/store integration suites, and focused Playwright plus real-Servatrice Docker scenarios.
- Release engineering has several strong controls: immutable action SHAs, minimal default workflow permissions, release attestations, attestation verification before deployment, environment scoping, and a live SHA smoke test.
- The current-state assessment and parity matrix distinguish static evidence, executed evidence, and uncertainty more rigorously than the implementation's older prose documentation.

### Recommended order of action

1. Make recovery honest: either disable raw automatic reconnect and expose explicit retry, or retain reusable authenticated-session intent and implement reauthentication/rejoin with forced-drop tests.
2. Establish a usable app gate: install/configure the Hooks plugin, separate formatting debt from semantic rules, make changed app code pass, and add Webatrice lint to CI.
3. Introduce a command outcome contract with timeout/disconnect cancellation and consistent user-visible error handling before expanding more protocol-backed UI.
4. Stop further UI-boundary erosion, then extract narrow capabilities from `PlayerBox`, `DeckEditor`, `Decks`, `useGameDialogs`, and `TopBar` incrementally.
5. Correct the bracket integration's degraded-data and trust behavior; then add agent-facing skills that route changes through these contracts.

## 2. Scope, method, and limitations

### Material sources reviewed

- The four existing audit reports under `docs/`, including priority and evidence notes in the 94-item parity matrix.
- Root and package manifests, Turbo configuration, TypeScript configuration, npm configuration, the lockfile relationship, and the Cockatrice submodule declaration.
- Architecture prose and Mermaid sources under `architecture/`.
- All `.github/instructions/*.instructions.md` files, the repo's audit-agent artifacts, and searches for `AGENTS.md` and `SKILL.md`.
- Sockatrice's `WebClient`, `WebSocketService`, `ProtobufService`, connection state, server-identification flow, keepalive, command options, and representative commands/tests.
- Datatrice provider/API wiring, root reducers, connection listeners, selectors, game listeners/reducers, and package boundary configuration.
- Webatrice provider/router composition, persistence, route features, lint boundaries, test/build configuration, external-data integrations, and representative large modules.
- CI, release, deployment, Docker/Servatrice, Playwright, Vitest, and composite-action configuration.

### Method and evidence labels

- **Confirmed** means direct source evidence, a local command result, or a recent reproducible result against the unchanged source commit.
- **Inferred** means the stated effect follows from confirmed control flow but was not reproduced through a live user scenario.
- **Unverified** means the repository does not establish the result and the relevant environment was not exercised.
- **Missing** means a scoped search confirmed absence; it is not used for a failed or partial search.

The current-state test/build evidence was reused where the implementation commit was unchanged. At review time, only assessment/documentation work was modified or untracked; `packages/**`, `.github/**`, manifests, and configuration remained at the audited commit. The review reran checks whose present result materially affected architectural conclusions.

### Exclusions and unresolved gaps

- No production Servatrice, public deployment, credentials, external API, analytics endpoint, or SSH target was contacted.
- Production HTTP response headers and reverse-proxy configuration were unavailable, so CSP, HSTS, cache, and other edge controls are **unverified**, not declared missing.
- No forced socket drop was executed. REL-001 is confirmed from source control flow; browser/server symptoms remain an inferred failure mode until a fault-injection test exists.
- Cockatrice/Servatrice C++ was not built or run. The separate Cockatrice checkout was used only as the current reference already documented by the assessment.
- Unit, integration, build, and Docker e2e suites were not repeated because the implementation commit and generated inputs were unchanged. Typecheck and app lint were rerun; their exact records appear in section 7.
- No penetration test, dependency-vulnerability audit, accessibility audit, coverage-percentage run, load test, or production observability review was performed.

## 3. Implemented architecture

### Components, boundaries, and dependency direction

```text
Webatrice React routes/features
  ├─ read normalized data through Datatrice selectors/hooks
  ├─ send commands through useWebClient().request.<scope>
  ├─ persist browser-only state through Dexie/localStorage
  └─ call selected third-party HTTP APIs directly
                │
                ▼
Sockatrice WebClient singleton
  ├─ command builders → ProtobufService correlation/serialization
  ├─ WebSocketService → ws/wss Servatrice transport
  └─ generated extension registries → inbound callbacks
                │
                ▼
Datatrice response implementations
  └─ listener middleware/reducers → server, rooms, games Redux state
                │
                └──────────────────────────────► Webatrice selectors/render
```

The dependency direction between the packages is appropriate: Webatrice depends on Datatrice and Sockatrice; Datatrice has a Sockatrice peer dependency; Sockatrice does not depend on either consumer. Generated protobuf messages remain the wire representation, while Datatrice supplies normalized application-domain shapes. This avoids a second hand-maintained protocol model.

Within Webatrice, the intended layers are root utilities/services/store, shared components/dialogs, multi-feature widgets, page wrappers, and vertical route features. `eslint.boundaries.mjs` declares these elements and uses a default-deny dependency rule. In practice, the boundary taxonomy is not aligned with all current code: `components/layout/TopBar.tsx` imports route features, and game `PlayerBox` modules import the decks feature's `cardLookup` implementation. The current rule catches the first case but not the same-element cross-feature imports.

### Runtime and data flows

At startup, `src/index.tsx` installs the BigInt JSON polyfill, composes `DatatriceProvider` and `WebClientProvider`, and renders the app. A card-preview popup deliberately skips router/store/client providers and receives data over `BroadcastChannel`. The main shell uses `MemoryRouter` and persists internal tabs and the last route, giving Webatrice a desktop-like shell rather than URL-native navigation.

For an outgoing action, a feature gets the singleton client from context and invokes a scoped request. Sockatrice builds a generated protobuf extension, assigns a monotonically increasing command ID, stores a callback, serializes a command container, and sends it if the socket is open. A matching response consumes the callback. Unsolicited session, room, and game events traverse generated extension registries into Datatrice response implementations and Redux listeners/reducers.

Redux is session memory. Dexie stores cards, sets, formats, known hosts, settings, and credential-equivalent remembered password hashes. Shell/tab state uses `localStorage`. This separation is sensible, although its security, migration, eviction, and identity-change contracts need to be stated more explicitly.

### Material differences between documented and implemented architecture

- `.github/instructions/webatrice.instructions.md:17` directs agents to `../cockatrice/src/`, but the repo's vendored checkout is sparse protocol data and the full audit checkout is `../Cockatrice-audit`; the instruction cannot be followed as written from this workspace.
- The same file states at line 29 that Webatrice has zero boundary violations. Current lint reports three, all in `src/components/layout/TopBar.tsx`.
- The documented reconnect policy describes socket mechanics, not authenticated-session recovery. Current reconnect recreates only the socket and cannot reuse the already-consumed login intent.
- The Playwright header says it does not retest keepalive, while the current suite/assessment includes a 60-second browser keepalive soak. Documentation is lagging the suite's role.
- The architecture identifies vertical route features, but game code directly consumes deck-feature internals, and very large modules combine domain mapping, browser interaction, protocol coordination, and rendering.

## 4. Prioritized findings

### Summary

| ID | Title | Priority | Confidence | Horizon | Effort | Affected area |
|---|---|---:|---|---|---|---|
| REL-001 | Raw socket reconnect cannot restore an authenticated session | P1 | High | Immediate | Medium | Transport, authentication, rooms/games |
| QUAL-001 | Webatrice's semantic quality gate is red, incomplete, and absent from CI | P1 | High | Immediate | Medium | Lint, CI, React correctness, boundaries |
| REL-002 | Pending commands have no total outcome or cancellation contract | P1 | High | Immediate | Medium | Protocol correlation, UI feedback, optimistic state |
| ARCH-001 | UI ownership boundaries are eroding around oversized orchestration modules | P1 | High | Near-term | Large | Frontend architecture, maintainability |
| DATA-001 | Bracket assessment treats remote failure as authoritative empty data | P1 | High | Immediate | Medium | External APIs, deck integrity, privacy |
| AGENT-001 | Critical project rules are not reliably discoverable or self-validating for agents | P1 | High | Immediate | Medium | Agent ergonomics, documentation, validation |
| DOMAIN-001 | Cockatrice compatibility has no single versioned baseline contract | P2 | High | Near-term | Small | Protocol/domain parity, e2e environment |
| TEST-001 | Strong test volume leaves important architecture contracts ungated | P2 | High | Near-term | Medium | Recovery, browsers, coverage, warnings |
| OBS-001 | Failures are not observable enough for a stateful real-time client | P2 | High | Near-term | Medium | Diagnostics, error containment, supportability |
| PERF-001 | Eager route composition and large modules produce an oversized initial bundle | P2 | High | Later | Medium | Startup performance, caching, deployment |
| SEC-001 | Remembered credentials and browser trust boundaries lack an explicit security contract | P2 | Medium | Near-term | Medium | Credential storage, XSS impact, deployment headers |

### REL-001 — Raw socket reconnect cannot restore an authenticated session

**Priority:** P1 · **Confidence:** High · **Horizon:** Immediate · **Effort:** Medium

**Affected components:** `@cockatrice/sockatrice` connection state and transport; login/session status; joined rooms and games.

**Observation — Confirmed.** `packages/sockatrice/src/commands/authentication/beginConnect.ts:9-12` stores connection options before the first socket connect. `packages/sockatrice/src/utils/connectionState.ts:3-12` provides a single mutable slot and `consumePendingOptions()` sets it to `null`. `packages/sockatrice/src/events/session/serverIdentification.ts:20-25` consumes that slot and disconnects with `Missing connection options` when it is empty. Unexpected close handling in `packages/sockatrice/src/services/WebSocketService.ts:125-131` schedules reconnect, and lines 195-203 create only a replacement WebSocket; they do not restore the authentication options. In addition, `onerror` sets `hasReportedError` at lines 149-153, while `shouldAttemptReconnect()` rejects that state at lines 171-173, so error-plus-close sequences skip retry entirely.

**Inference and failure mode.** After an initially successful login, a clean unexpected close can show `RECONNECTING`, reopen the transport, receive Servatrice identification, fail for absent options, and close. It cannot reauthenticate or rejoin rooms/games. Network paths that emit `error` before `close` do not even enter the retry schedule. During the intermediate reconnect, retained Redux game/room data can appear current although the socket is unauthenticated.

**Target state.** Make recovery an explicit session state machine, not a socket feature. Choose and document one of two valid products: (a) no automatic reconnect, with an explicit retry that preserves safe host/form state; or (b) automatic reauthentication using a deliberately retained credential/session intent, followed by deterministic room and game restoration or a safe fallback when restoration is impossible.

**Remediation direction.** Separate `connection attempt` from reusable `session recovery intent`; never reuse password-reset/registration intents automatically. Define states such as transport-reconnecting, authenticating, restoring, restored, and recovery-failed. Reset or reconcile server/room/game state at stated boundaries. Add forced-close and error-plus-close tests against real Servatrice.

**Dependencies/trade-offs.** Automatic game rejoin needs Servatrice behavior, credential handling, duplicate-session rules, and user expectations to be resolved. Explicit retry is safer and smaller but provides less seamless recovery.

**Validation criteria.** A real-server test drops an authenticated socket in a room and in a game; the UI reaches one documented stable outcome without stale authority, duplicate commands, or an infinite loop. Both browser `error → close` and close-only sequences are covered.

### QUAL-001 — Webatrice's semantic quality gate is red, incomplete, and absent from CI

**Priority:** P1 · **Confidence:** High · **Horizon:** Immediate · **Effort:** Medium

**Affected components:** Webatrice ESLint config, Hooks correctness, boundary enforcement, root `golden`, CI.

**Observation — Confirmed.** A fresh ESLint API run over 486 app files found **3,555 errors and 12 warnings in 69 files**. Most are formatting debt, but the result includes three `boundaries/dependencies` errors, one restricted runtime `WebClient` import, and eleven `react-hooks/exhaustive-deps` failures that say the rule definition was not found. `packages/webatrice/eslint.config.mjs:1-17` configures JavaScript, TypeScript, and boundaries plugins but no React Hooks plugin. `.github/workflows/ci.yml:131-137` runs only Sockatrice and Datatrice lint; no Webatrice lint step exists. The repo describes `golden` as the handoff/CI gate even though app lint makes it fail.

**Concern.** Formatting debt obscures architectural errors, while the absent Hooks plugin means dependency-array suppressions and expectations do not actually enforce effect correctness. The CI result can be green while a declared architecture boundary is red. Agents learn that documented validation is either unactionable or optional.

**Target state.** A semantic app gate that is green and required. Formatting can be migrated mechanically or temporarily isolated, but Hooks, restricted imports, unused code, TypeScript-aware hazards, and boundary rules should block changed code immediately.

**Remediation direction.** Install/configure `eslint-plugin-react-hooks`; remove invalid disable comments; split formatter-style rules from semantic lint; baseline legacy formatting if a one-shot cleanup is too disruptive; add an unconditional or change-filtered Webatrice lint step; make the advertised handoff command match CI.

**Dependencies/trade-offs.** A full formatting rewrite creates merge churn. A baseline/delta strategy reduces churn but needs a clearly owned expiry plan and must not suppress semantic rules.

**Validation criteria.** `npm run -w @cockatrice/webatrice lint` exits zero, an intentionally stale effect fails, a forbidden dependency fails, CI runs the command for app/root/config changes, and `npm run golden` is a truthful local equivalent.

### REL-002 — Pending commands have no total outcome or cancellation contract

**Priority:** P1 · **Confidence:** High · **Horizon:** Immediate · **Effort:** Medium

**Affected components:** Sockatrice command correlation; Datatrice response flow; Webatrice loading, toast, and optimistic interactions.

**Observation — Confirmed.** `packages/sockatrice/src/services/ProtobufService.ts:55-65` stores callbacks in a map and clears them on reset. Lines 199-208 add a pending callback only when the socket is open; lines 240-249 complete it only when a matching response arrives. There is no timeout. `packages/sockatrice/src/WebClient.ts:179-184` calls `resetCommands()` on disconnected status, which drops callbacks without invoking their error path. `dispatchCommand()` at `ProtobufService.ts:187-196` can report only an immediate not-open send; later disconnect and non-response are invisible to callers.

**Concern and failure mode.** A command lost after send can leave a dialog spinner, pending save, or optimistic UI indefinitely. Disconnect removes the only callback that could roll back or explain the result. Different features therefore invent inconsistent recovery, often with optional `onError` callbacks or console warnings.

**Target state.** Every command reaches exactly one typed terminal outcome: success, server rejection, transport unavailable, timeout, disconnect cancellation, or explicit caller cancellation. Correlation should carry command type and safe diagnostic context.

**Remediation direction.** Replace raw callbacks with a small pending-command record containing deadline, completion guard, and cancellation handler; reject all pending commands with a typed reason on terminal disconnect; decide which idempotent reads may retry; provide UI adapters for loading/error/rollback. Do not automatically retry mutations without an idempotency contract.

**Dependencies/trade-offs.** Timeout values differ for local Docker and remote servers. Retrying requires command-specific safety analysis. A promise API may be introduced beside callbacks to avoid a high-risk flag day.

**Validation criteria.** Unit tests use fake timers for deadline behavior; disconnect completes each pending command once; late responses are ignored safely; representative deck, room, and game mutations render an actionable error and restore optimistic state.

### ARCH-001 — UI ownership boundaries are eroding around oversized orchestration modules

**Priority:** P1 · **Confidence:** High · **Horizon:** Near-term · **Effort:** Large

**Affected components:** game/player board, deck editor/list, dialogs, shared layout, feature-boundary lint.

**Observation — Confirmed.** Current source line counts include `PlayerBox.tsx` **11,058**, `DeckEditor.tsx` **2,552**, `GameBoardCell.tsx` **1,871**, `Decks.tsx` **1,625**, and `useGameDialogs.ts` **1,521**. `PlayerBox.tsx` contains card/domain types, coordinate/wire mapping, context-menu construction, many modal implementations, DOM event orchestration, portals, drag/drop, Scryfall integration, and rendering. `packages/webatrice/src/features/game/components/PlayerBox/PlayerBox.tsx:64-70`, `IncomingRevealDialog.tsx:21`, and `LibrarySearchDialog.tsx:15` import decks feature internals. `components/layout/TopBar.tsx:10-20` imports features and produces the three live boundary errors.

**Concern.** These files are not merely long presentational components; they centralize unrelated change reasons and cross feature ownership. A local game change can alter deck lookup, modal focus, transport calls, coordinate transforms, and render behavior in one diff. Same-type cross-feature imports are not prevented by the current boundary model. Large files also increase agent context loss and merge collision probability.

**Target state.** Route features own orchestration but depend on small domain adapters and shared capabilities, not other route internals. Complex game interactions are expressed as testable hooks/controllers plus presentational components. Shared card lookup belongs in a root service or a narrowly scoped card-data widget/package. Page chrome lives consistently in `feature-wrappers`.

**Remediation direction.** First fix and extend boundary rules to distinguish individual features or forbid cross-feature relative resolution. Move card lookup behind a shared public interface. Move `TopBar` to the declared wrapper ownership. Extract one behavior seam at a time from PlayerBox—wire mapping, context-menu model, zone drag controller, modal family, and battlefield rendering—with characterization tests before movement. Apply the same approach to deck search/pricing/bracket and dialog orchestration.

**Dependencies/trade-offs.** A rewrite is too risky. Extraction can temporarily increase files and adapter code; success should be measured by ownership and isolated tests rather than raw line count alone.

**Validation criteria.** Boundary lint rejects game→decks and shared→feature imports; no new production TSX file exceeds an agreed review threshold without an explicit exception; extracted controllers have focused tests; existing e2e gameplay remains green.

### DATA-001 — Bracket assessment treats remote failure as authoritative empty data

**Priority:** P1 · **Confidence:** High · **Horizon:** Immediate · **Effort:** Medium

**Affected components:** deck editor/breakdown, Scryfall and Commander Spellbook integration, `.cod` cached assessment, user trust.

**Observation — Confirmed.** `packages/webatrice/src/features/decks/DeckBreakdown.tsx:452-476` automatically invokes bracket analysis when a cached fingerprint misses and persists the resulting assessment. `bracket.ts:404-417` runs three external data requests. `bracket.ts:281-301` POSTs every deck card name and quantity to Commander Spellbook but returns `[]` for HTTP or network failure. `bracket.ts:133-149` similarly turns Game Changer failures into an empty set; lines 191-225 cache empty oracle text on failures.

**Concern and failure mode.** Empty data is a valid domain result and an error sentinel. A network outage can therefore under-classify a deck, present the answer as complete, and persist it under the deck fingerprint so future renders skip the network. The integration also crosses a material trust boundary—complete deck contents leave Webatrice automatically—without a documented consent, privacy, retention, timeout, or availability contract.

**Target state.** External adapters return provenance and completeness, for example `{ data, status, sourceVersion, failures }`. The classifier distinguishes complete, partial, unavailable, and stale results. A degraded result is not cached as authoritative. Users are told when a full deck is sent to a third party and can retry or disable the feature.

**Remediation direction.** Add typed adapter results, timeouts/abort signals, visible partial-data states, and a cache schema that records source/version/completeness. Decide whether Spellbook analysis is opt-in, first-use consent, or an explicitly documented core function. Avoid sending sideboard/private metadata not required by the API.

**Dependencies/trade-offs.** Accurate offline classification may require vendoring/versioning datasets and combo logic, which adds update ownership. Keeping remote analysis is simpler but must expose availability and trust semantics.

**Validation criteria.** HTTP 500, timeout, malformed JSON, partial Scryfall results, and Spellbook outage cannot produce a normal authoritative bracket; no degraded result is persisted; UI explains the external transfer and result provenance; adapter tests contain no real network.

### AGENT-001 — Critical project rules are not reliably discoverable or self-validating for agents

**Priority:** P1 · **Confidence:** High · **Horizon:** Immediate · **Effort:** Medium

**Affected components:** repository guidance, Codex workflows, parity work, handoff validation.

**Observation — Confirmed.** No repository `AGENTS.md` or project `SKILL.md` exists. Important invariants are distributed across ten `.github/instructions/*.instructions.md` files, which are useful but tool-specific and path-scoped. Some statements are stale: Webatrice instructions claim zero boundary violations and point to a non-existent full desktop source path. The advertised `golden` gate is known to fail. Audit prompts/findings under `.agents/` are task artifacts, not reusable triggerable skills.

**Concern.** An agent can begin work without loading the applicable instruction file, and no entry point maps a requested change to the required Cockatrice, protocol, state, UI, and test evidence. When it does load the prose, stale absolutes can be mistaken for verified facts. This is especially unsafe where field presence, hidden card identity, session recovery, or optimistic game actions span packages.

**Target state.** A short root agent entry point plus narrow, triggerable project skills. The entry point identifies the architecture and routes work to authoritative scoped references. Skills run checks and require evidence; they do not duplicate large prose bodies. Claims about current status are generated or validated, not hand-maintained as timeless assertions.

**Remediation direction.** Add a root `AGENTS.md` that points to applicable instructions and skills; create the focused skills proposed in section 5; replace status claims such as “zero violations today” with required commands; add a compatibility-baseline manifest and a validation script that checks referenced paths.

**Dependencies/trade-offs.** Duplicating instructions creates more drift. Skills should link to source instructions and encode routing/checklists/scripts only where execution adds value.

**Validation criteria.** A fresh agent presented with representative transport, reducer, game UI, deck external-API, and docs changes selects the correct references and validation without prior conversation; all linked paths resolve; status claims are command-derived.

### DOMAIN-001 — Cockatrice compatibility has no single versioned baseline contract

**Priority:** P2 · **Confidence:** High · **Horizon:** Near-term · **Effort:** Small

**Affected components:** generated protocol, desktop parity decisions, Servatrice e2e, documentation.

**Observation — Confirmed.** The Webatrice commit pins `vendor/cockatrice` to `63143f941643dc2f46f658cb51ea3b5727da3e56`; the current full audit checkout is `a571a9aa04796915db172e2e60280ecbd5ec8926`; `.env.e2e` pins Servatrice `2026-05-08-Release-3.0.0`. Existing limitations explicitly leave unresolved whether parity follows Cockatrice tip, the submodule, or a coordinated release. Instructions simultaneously call desktop source the spec and generated vendored protocol authoritative.

**Concern.** Agents can correctly reproduce a desktop-tip behavior that cannot be encoded by the pinned protobuf or differs from the e2e server. A passing local unit test then does not answer which product versions are supported.

**Target state.** A committed compatibility contract naming the reference Cockatrice behavior commit/release, protocol-definition commit, supported Servatrice release range, and upgrade procedure. Deviations should be recorded as intentional compatibility decisions.

**Remediation direction.** Add a small machine-readable manifest and render it into docs/build metadata; update the full reference checkout guidance; create a scheduled or upgrade-triggered compatibility job; make parity items cite the selected baseline.

**Dependencies/trade-offs.** Tracking tip maximizes parity freshness but creates churn. Tracking coordinated releases is more reproducible but intentionally lags desktop development.

**Validation criteria.** One command prints the supported trio; generated bindings and Docker image match the manifest; a dependency update PR shows the behavior/protocol/e2e delta and required parity review.

### TEST-001 — Strong test volume leaves important architecture contracts ungated

**Priority:** P2 · **Confidence:** High · **Horizon:** Near-term · **Effort:** Medium

**Affected components:** Webatrice Vitest/Playwright, coverage, recovery, accessibility/browser support.

**Observation — Confirmed.** The repository contains 32/16/2 Sockatrice unit/integration/e2e spec files, 25/7 Datatrice unit/integration files, and 155/34/6 Webatrice unit/integration/e2e files. Recent results passed 2,725 unit, 381 integration, and eight real-server e2e tests. Yet `packages/webatrice/playwright.config.ts:38-43` defines Chromium only. Webatrice coverage configuration at `vite.config.ts:126-137` has no thresholds, unlike Sockatrice and Datatrice. The current suite does not force reconnect, cover full command timeout/cancellation (none exists), or establish an accessibility target. Passing unit tests emit React `act` and selector warnings.

**Concern.** Test count is high, but the contracts most likely to fail across architecture seams—recovery, cancellation, browser persistence/migration, degraded third-party data, focus/keyboard behavior, and non-Chromium APIs—are not release gates. Running coverage without a threshold or retained report adds CI cost but no ratchet.

**Target state.** Contract-driven gates: recovery fault injection, typed command cancellation, representative multi-browser smoke, migration fixtures, external-adapter failure tests, and a modest Webatrice coverage ratchet. Treat unexpected test warnings as failures or budgeted exceptions.

**Remediation direction.** Add tests with each earlier remediation rather than a standalone test rewrite. Start Firefox/WebKit with boot/login/persistence and one gameplay interaction. Establish thresholds from a measured baseline and ratchet. Add an accessibility smoke appropriate to the desktop scope.

**Dependencies/trade-offs.** Real-browser/server jobs are expensive and can be flaky; retain unit/integration ownership for protocol logic and keep e2e to essential seam contracts.

**Validation criteria.** CI fails for a broken reconnect outcome, lost command cancellation, regression below Webatrice thresholds, unexpected warning, and supported-browser smoke failure; retry rates and artifacts remain reviewable.

### OBS-001 — Failures are not observable enough for a stateful real-time client

**Priority:** P2 · **Confidence:** High · **Horizon:** Near-term · **Effort:** Medium

**Affected components:** app root, transport/protobuf logging, support diagnostics, deployment.

**Observation — Confirmed.** A scoped search found no React error boundary, global `error`/`unhandledrejection` handler, structured logger, or error-reporting integration. `ProtobufService.ts:211-237` catches decode/dispatch failures and writes only to `console.error`; WebSocket send failures log or return. `analytics.ts` defines two product events and deliberately swallows analytics errors; it is not operational telemetry. Release/deploy verifies artifact identity and liveness but not application health.

**Concern.** A render exception can remove a major UI subtree without a recovery surface. Protocol decode, command timeout, reconnect, Dexie migration, and third-party failures cannot be correlated by a user or operator. Console-only evidence disappears, is inconsistent, and can accidentally include sensitive payloads if expanded ad hoc.

**Target state.** A small redacting diagnostics layer with stable event names and correlation identifiers; root and feature error boundaries with reset/reload guidance; a user-exportable support snapshot; optional production reporting controlled by deployment/privacy policy.

**Remediation direction.** Define safe fields before choosing a vendor. Instrument connection transitions, command terminal outcomes, protocol decode failures, persistence migration failures, and root errors. Never log passwords, hashes, tokens, private messages, hidden card identities, or full deck/replay payloads.

**Dependencies/trade-offs.** Telemetry changes the privacy surface and needs retention/consent decisions. A local ring buffer plus user-initiated export provides value before remote reporting.

**Validation criteria.** Injected render, decode, timeout, reconnect, and IndexedDB failures produce a recoverable UI and a redacted correlated record; automated tests assert prohibited fields are absent.

### PERF-001 — Eager route composition and large modules produce an oversized initial bundle

**Priority:** P2 · **Confidence:** High · **Horizon:** Later · **Effort:** Medium

**Affected components:** router, Vite chunks, deck/game code, deployment caching.

**Observation — Confirmed.** `packages/webatrice/src/AppShellRoutes.tsx:4-14` eagerly imports every route feature. `vite.config.ts:74-104` manually splits third-party libraries but not feature code. The current production output contains an app entry of approximately **771.6 KiB** and a generic vendor chunk of **625.4 KiB**, both above Vite's 500 KiB warning threshold, before decompression. No source maps are shipped in the local build artifact.

**Concern.** Login/initialization users parse deck editor and complex game UI they may not visit. Large modules reduce code-splitting opportunities and invalidate large chunks for small changes. Performance impact on production clients is inferred because no network/CPU profile was run.

**Target state.** Lazy route boundaries, stable capability chunks, and an explicit compressed bundle budget tested in CI. Preload only the next likely route after authentication.

**Remediation direction.** Use `React.lazy`/router lazy loading for deck, game, logs, account, settings, and admin/replay additions; extract shared card-data code before splitting to avoid duplication; measure gzip/Brotli and parse/interaction timing; add a manifest diff/budget.

**Dependencies/trade-offs.** Over-splitting creates request waterfalls and duplicate dependencies. Measure representative desktop Chromium first, then validate supported browsers.

**Validation criteria.** Login shell excludes deck/game feature chunks; largest compressed startup chunks meet an agreed budget; no route regresses loading/error UX; a CI report shows size deltas.

### SEC-001 — Remembered credentials and browser trust boundaries lack an explicit security contract

**Priority:** P2 · **Confidence:** Medium · **Horizon:** Near-term · **Effort:** Medium

**Affected components:** known hosts/Dexie, login/auto-connect, external scripts and images, deployment headers.

**Observation — Confirmed.** `packages/webatrice/src/types/server.ts:1-16` includes `hashedPassword` on the persisted `Host`; `HostDTO.ts:5-23` stores host objects in Dexie; `useAutoLogin.ts:38-51` uses that hash to authenticate. It is therefore a credential equivalent, even though plaintext is not retained. `index.html:17-21`, `analytics.ts:47-50`, and CSS/image references load executable or display resources from external origins. No client-side CSP declaration exists. Production header controls are **unverified** because server configuration is outside this repository.

**Concern.** Any successful same-origin script injection can read IndexedDB and obtain a reusable login verifier. Dynamic analytics and many external resource origins broaden the CSP/availability/privacy design. The repository does not state the threat model, hash portability, logout/forget semantics, storage-eviction behavior, or required deployment headers.

**Target state.** Treat the remembered hash as a credential in design, logging, tests, and UI. Define opt-in storage/forget/logout behavior, origin restrictions, dependency/external-script policy, and deployment security headers. Prefer a server-issued revocable scoped token if Servatrice can support it; otherwise document the verifier's limitations.

**Remediation direction.** Add a browser security/persistence threat model; ensure delete/logout paths purge credentials as promised; prevent credentials from diagnostics/Redux/devtools; inventory external origins; deploy and verify an appropriate CSP and related headers; avoid inline/dynamically generated script where practical.

**Dependencies/trade-offs.** Browser storage cannot protect a credential from same-origin XSS. WebCrypto encryption without an independently protected key does not solve that threat. Server-issued revocable tokens require protocol/server work.

**Validation criteria.** Automated tests cover remember, forget, host deletion, logout, identity switch, and diagnostic redaction; deployment smoke asserts agreed headers; an external-origin inventory matches CSP; the UI accurately describes what is stored.

## 5. Project-specific skill proposals

### Prioritized proposal summary

| Skill | Priority | Finding IDs | Purpose |
|---|---:|---|---|
| `webatrice-change-router` | P1 | AGENT-001, ARCH-001, DOMAIN-001 | Route any change to the correct layers, references, and checks |
| `webatrice-protocol-parity-slice` | P1 | REL-002, ARCH-001, DOMAIN-001 | Implement one protocol-backed behavior end to end |
| `webatrice-recovery-contract` | P1 | REL-001, REL-002, OBS-001, TEST-001 | Make transport/session/command recovery explicit and fault-tested |
| `webatrice-quality-gate` | P1 | QUAL-001, ARCH-001, TEST-001, AGENT-001 | Apply truthful change-aware validation and baseline-delta rules |
| `webatrice-ui-boundary` | P1 | ARCH-001, QUAL-001, PERF-001 | Enforce feature ownership and safe incremental decomposition |
| `webatrice-external-data-adapter` | P1 | DATA-001, OBS-001, SEC-001 | Govern third-party requests, degraded results, privacy, and caching |

These proposals complement the existing `.github/instructions` files. They should link to those files and run or require checks; they should not copy the full invariant prose into six more places.

### `webatrice-change-router`

- **Priority / findings:** P1; AGENT-001, ARCH-001, DOMAIN-001.
- **Triggers:** Any requested production, test, configuration, protocol, persistence, or architecture change in this repository.
- **Responsibilities:** Classify the change as protocol, state, UI, persistence, external integration, build/release, or documentation; load the applicable scoped instructions; identify Cockatrice/Servatrice baseline evidence; produce a layer/test plan; detect generated files and user changes.
- **Non-goals:** It does not implement domain behavior, choose parity divergence, or replace specialist skills.
- **Rules enforced:** UI uses `useWebClient`; inbound data changes traverse Datatrice; generated protobuf/i18n files are not hand-edited; desktop divergence requires explicit scope; user changes are preserved.
- **References:** root `AGENTS.md` once created; `.github/instructions/`; `docs/current-state.md`; `docs/cockatrice-parity-matrix.md`; compatibility manifest proposed by DOMAIN-001; package manifests.
- **Validation/acceptance:** Output lists touched layers, authoritative references, required tests, generated artifacts, and unresolved decisions before editing. A bundled path-check script verifies every referenced file.
- **Supporting resources:** Change-classification checklist, mapping table from paths to instructions/skills, `scripts/check-agent-links.*`.
- **Expected benefit / effort:** Consistent startup context and fewer layer-skipping changes; **Small–Medium**.

### `webatrice-protocol-parity-slice`

- **Priority / findings:** P1; REL-002, ARCH-001, DOMAIN-001.
- **Triggers:** Adding or changing a Servatrice command, response, event, game action, account/deck/replay/moderation workflow, or Cockatrice parity item.
- **Responsibilities:** Trace desktop behavior and server semantics; verify proto fields/presence; implement command → response/event → Datatrice state → selector → UI; define all terminal errors; update the parity item; require the smallest sufficient unit/integration/e2e evidence.
- **Non-goals:** Visual redesign unrelated to capability; hand-editing generated bindings; declaring parity from a UI element alone.
- **Rules enforced:** Selected compatibility baseline is cited; proto2/proto3 presence is tested; hidden information and judge/observer/owner permissions are preserved; no direct UI server-data mutation except documented exceptions; user-visible failures are handled.
- **References:** compatibility manifest; Cockatrice and Servatrice files; `vendor/cockatrice/libcockatrice_protocol`; Sockatrice/Datatrice/Webatrice scoped instructions; parity matrix row.
- **Validation/acceptance:** Layer-specific lint/typecheck; command encoding/presence test; Datatrice state transition test; UI error/success test; integration round trip; real e2e only when the seam requires it.
- **Supporting resources:** End-to-end trace template, protocol field-presence checklist, parity-row update template, fixture builders.
- **Expected benefit / effort:** Prevents “transport exists, UI partial” and wire/state divergence; **Medium**.

### `webatrice-recovery-contract`

- **Priority / findings:** P1; REL-001, REL-002, OBS-001, TEST-001.
- **Triggers:** Changes to WebSocket lifecycle, login/session status, keepalive, command correlation, optimistic updates, game rejoin, or loading/error state.
- **Responsibilities:** Build a fault matrix; distinguish socket, authentication, room, and game recovery; require typed command terminal outcomes; specify retained/cleared state; add deterministic fake-timer and forced-drop tests; require redacted diagnostics.
- **Non-goals:** Blind retries of mutations; storing plaintext credentials; claiming session restoration from an open socket.
- **Rules enforced:** Registration/reset intents never auto-replay; pending commands complete once; late responses are safe; optimistic changes have rollback/reconcile behavior; stale state is never presented as authoritative.
- **References:** Sockatrice transport instructions; `WebSocketService.ts`; `ProtobufService.ts`; `connectionState.ts`; Datatrice connection reducers/listeners; game lifecycle hooks; Docker e2e helpers.
- **Validation/acceptance:** Error→close, close-only, timeout, reconnect exhaustion, successful reauth, failed rejoin, late response, and teardown tests. At least one real-Servatrice forced-drop scenario for the selected product behavior.
- **Supporting resources:** Fault-matrix template, controllable WebSocket fake, Docker proxy/drop helper, command outcome test helpers.
- **Expected benefit / effort:** Converts the highest-risk implicit behavior into an executable contract; **Medium–Large**.

### `webatrice-quality-gate`

- **Priority / findings:** P1; QUAL-001, ARCH-001, TEST-001, AGENT-001.
- **Triggers:** Before handoff of any code/config/test change; whenever lint/test configuration changes.
- **Responsibilities:** Run change-aware semantic lint, typecheck, focused tests, integration/e2e as risk demands, generated-file checks, boundary checks, and `git diff --check`; compare against an explicit baseline while legacy debt exists; summarize warnings and cached results honestly.
- **Non-goals:** Auto-fixing unrelated user code; treating test count or cache replay as fresh execution; running expensive e2e for documentation-only work.
- **Rules enforced:** Hooks and boundary rules are always active; no new lint debt; changed production code has focused tests; tracked generated artifacts are regenerated only by their owner command.
- **References:** package scripts; CI workflow; lint/Vitest/Playwright configs; onboarding; current baseline file produced during QUAL-001 remediation.
- **Validation/acceptance:** Machine-readable summary contains commands, exit codes, cached/fresh status, baseline delta, skipped checks, and reason. CI uses the same core script.
- **Supporting resources:** `scripts/validate-change.*`, lint-baseline JSON limited to legacy formatter debt, warning allowlist with owners/expiry.
- **Expected benefit / effort:** Makes “done” reproducible without requiring a disruptive cleanup first; **Medium**.

### `webatrice-ui-boundary`

- **Priority / findings:** P1; ARCH-001, QUAL-001, PERF-001.
- **Triggers:** New route/feature/widget; imports across feature roots; edits to large modules; new modal, global event listener, portal, drag/drop flow, or shared card capability.
- **Responsibilities:** Assign ownership; enforce allowed dependency direction; choose root service vs widget vs wrapper vs feature; require extraction characterization tests; check focus/cleanup/accessibility; assess lazy-loading/chunk impact.
- **Non-goals:** Arbitrary line-count refactors; centralizing unrelated UI; moving code without reducing change reasons.
- **Rules enforced:** No feature-internal import by another feature; shared components cannot import features; browser globals are isolated and cleaned up; orchestration and presentational concerns are separable; exceptions have owner and expiry.
- **References:** Webatrice and game instructions; `eslint.boundaries.mjs`; route aliases; architecture diagrams; largest-module report.
- **Validation/acceptance:** Boundary lint, focused interaction tests, cleanup tests for globals/portals, keyboard behavior, and bundle-size delta when a route boundary changes.
- **Supporting resources:** Ownership decision tree, extraction checklist, module-size report script, cross-feature import resolver.
- **Expected benefit / effort:** Reduces merge/context risk and gives agents bounded implementation surfaces; **Medium**.

### `webatrice-external-data-adapter`

- **Priority / findings:** P1; DATA-001, OBS-001, SEC-001.
- **Triggers:** Any new or changed `fetch`, external script/image/data origin, analytics event, pricing/card/combo integration, or cache of remote-derived data.
- **Responsibilities:** Define typed success/partial/unavailable outcomes; add timeout/abort, schema validation, provenance/version, cache validity, user disclosure, and redacted diagnostics; update external-origin/CSP inventory.
- **Non-goals:** Hiding failures as empty data; remote calls in render-only components; logging request payloads containing credentials, chats, deck/replay content, or hidden game data.
- **Rules enforced:** Error sentinel differs from valid empty; degraded data is not authoritative; only minimum necessary data leaves the app; third-party use is visible and testable; no real network in unit/integration suites.
- **References:** `services/analytics.ts`; Scryfall services; deck `bracket.ts`, `pricing.ts`, `cardLookup.ts`; persistence schema; security/persistence contract proposed by SEC-001.
- **Validation/acceptance:** Adapter contract tests cover timeout, non-2xx, invalid JSON/schema, partial data, cancellation, cache expiry, and redaction; origin inventory and CSP tests remain synchronized.
- **Supporting resources:** Fetch adapter template, fake-response builders, provenance type, privacy/trust checklist, origin manifest.
- **Expected benefit / effort:** Prevents silent data corruption and unmanaged trust expansion; **Medium**.

## 6. Recommended remediation sequence

### Immediate risk reduction

1. Decide the REL-001 product behavior and remove the misleading intermediate behavior. If full recovery cannot be implemented in one increment, disable raw retry and provide a clear explicit retry rather than advertising reconnect that cannot authenticate.
2. Repair semantic lint first: Hooks plugin, invalid suppressions, restricted import, and live boundary errors. Add the app step to CI using a baseline/delta plan for formatter debt.
3. Make the bracket result incomplete on upstream failure and stop persisting degraded results. Add disclosure before deciding broader integration policy.
4. Add a minimal typed disconnect/timeout outcome to pending commands and apply it to the currently visible P1 command failures.
5. Add a root agent entry point and the change-router/quality-gate skills so subsequent remediation follows the same rules.

### Foundational architectural work

1. Publish the Cockatrice/protocol/Servatrice compatibility baseline.
2. Implement the session recovery state machine and command lifecycle together; both own disconnect semantics.
3. Move card data lookup out of the decks feature and repair wrapper/component ownership before extracting the largest game and deck modules.
4. Add the external-data adapter and diagnostics contracts so new extractions do not preserve silent failure behavior.
5. Establish Webatrice coverage/warning/browser ratchets from measured baselines.

### Subsequent maintainability improvements

1. Extract `PlayerBox` behavior seams incrementally, then `DeckEditor`, `Decks`, `GameBoardCell`, and `useGameDialogs`.
2. Add route-level lazy loading and a bundle budget after shared card code has stable ownership.
3. Add error boundaries, a redacted local support snapshot, and optional production reporting.
4. Formalize remembered-credential and external-origin policy, then verify deployment headers.

### Important dependencies

- Game restoration depends on Servatrice duplicate-session/rejoin behavior and the credential contract.
- Command retry depends on idempotency; command timeout/cancellation does not.
- Bundle splitting should follow boundary cleanup to avoid duplicate deck/game card-data chunks.
- Remote error telemetry depends on privacy/retention decisions; local redacted diagnostics do not.
- Multi-browser gating depends on an explicit supported-browser statement.

## 7. Evidence and validation record

### Commands executed in this review

| Command/check | Outcome |
|---|---|
| `git rev-parse HEAD` | `cfdf276368f6663db71a952665fafb0adee307ec` |
| `git status --short`, `git diff --name-only`, untracked-file inventory | Only pre-existing/user audit documentation and audit artifacts were dirty; no production/config/test source changes were present before this report. |
| ESLint Node API over `packages/webatrice/src` | 486 files; 69 files with errors; 3,555 errors; 12 warnings. Top counts: indent 1,841; quotes 760; curly 723; max-len 177. Semantic results included 11 missing Hooks-rule definitions, 3 boundary violations, and 1 restricted import. |
| `npm run typecheck` | Pass: five Turbo tasks successful. All five were cache hits, so this confirms the current task graph/cache result, not a fresh compiler execution. The unchanged source commit also had a fresh pass in the current-state audit. |
| Source line-count inventory excluding generated/dependency/build output | Confirmed the large-module counts cited in ARCH-001. |
| Cross-feature import search under `src/features` | Confirmed three game PlayerBox modules importing `features/decks/cardLookup`. |
| Current build artifact size inventory | Confirmed approximately 771.6 KiB app entry and 625.4 KiB generic vendor chunk; zero JavaScript source maps in the local app artifact. |
| `git ls-tree HEAD vendor/cockatrice`, direct submodule `rev-parse`, safe-directory Cockatrice audit `rev-parse` | Confirmed protocol pin `63143f...` and full reference `a571a9...`. |
| `git submodule status vendor/cockatrice` | Inconclusive because Git's shell could not find `basename`, `sed`, or `git-sh-setup` on this Windows PATH. The gitlink and checkout commits were verified with the direct commands above; the failed wrapper was not treated as absence. |
| Repository searches for `AGENTS.md`, `SKILL.md`, error boundaries, structured logging, recovery tests, browser projects, coverage thresholds, and external origins | Supported AGENT-001, TEST-001, OBS-001, and SEC-001 within the stated negative-search scope. |

### Reused recent validation

Because package source, manifests, generated inputs, and workflows remain at the same audited commit, this review reused the current-state results: 2,725 passing unit tests (2 skipped), 381 passing integration tests (2 skipped), successful production build with chunk warnings, successful development-server probe, and eight passing Docker-backed real-Servatrice e2e tests. Those results establish the cited paths only; they do not establish forced-drop recovery, external services, non-Chromium behavior, or production deployment health.

### Evidence gaps and unverified conclusions

- REL-001's code path is confirmed; exact browser timing and what the user sees after a real forced drop are unverified.
- Performance user impact is inferred from artifact size/eager imports; no Core Web Vitals or CPU/network profile was run.
- Production CSP and other HTTP headers are unverified because deploy target configuration is not in the repo and was not contacted.
- The security impact of a remembered hash depends on server behavior and production XSS defenses; the hash's use as an authentication credential is confirmed.
- There is no line-coverage claim for Webatrice. Coverage configuration was inspected but coverage was not executed.
