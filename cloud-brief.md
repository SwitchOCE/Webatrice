# Brief for every parity-run CLOUD worker

You are one of several agents closing Cockatrice-parity gaps in **Webatrice**, the browser port of the
Cockatrice MTG client. Your output is a git branch that will be submitted upstream as a PR to
`Cockatrice/Webatrice`, reviewed by maintainers who hold a high bar. Write code that reads like the
best existing code in `packages/sockatrice` and `packages/datatrice`.

You run in a Claude Code cloud session with the fork `SwitchOCE/Webatrice` checked out at `/home/user/Webatrice`
(remote `origin`). A local orchestrator reads your pushed branches and your final message; it cannot talk to you
during the run, so make decisions yourself and record them.

## Reference material (read only what your task needs)

- Notes branch: `git fetch origin parity-notes && git worktree add /tmp/notes origin/parity-notes` → `/tmp/notes/`
  - `prs/parity-*.md` — PR descriptions of every branch in the series (what each did, decisions, follow-ups)
  - `game-gaps.md`, `plat-long-gaps.md` — verified gap tables
  - `docs/cockatrice-parity-matrix.md` (94 parity rows), `docs/webatrice-solid-refactor-plan.md`,
    `docs/architecture-implementation-review.md` — the audit
- Desktop reference (Cockatrice master `add65ca`, desktop is the spec):
  `git clone --filter=blob:none --no-checkout https://github.com/Cockatrice/Cockatrice /tmp/cockatrice && git -C /tmp/cockatrice checkout add65caa`
  (`cockatrice/src`, `servatrice/src`, `libcockatrice_protocol`).

## Hard rules

- **Push only to the branch named in your task** (always `claude/...`). Never push to `parity/*`, `master`, or other
  `claude/*` branches. Never force-push a branch you did not create in this run. Never open PRs, never use `gh`.
- Never use bare `git stash`. Do not edit the audit docs.

## Survival

- **Commit and push early and often** (after each coherent green step: `git push origin HEAD:<your claude/ branch>`).
  A run that dies after a push loses nothing.
- Read narrowly: grep first, read excerpts. Never read `PlayerBox.tsx` whole.

## Mailbox (talking to the orchestrator)

The orchestrator cannot message your session directly. You talk through git, with a lag of a few minutes:

- **Inbox (orchestrator → you):** `origin/parity-notes:inbox/<task-id>.md`. Check it at every checkpoint (before
  each commit, before starting a long command, and when you get stuck):
  `git fetch -q origin parity-notes && git show origin/parity-notes:inbox/<task-id>.md 2>/dev/null`.
  Messages are numbered `## M1`, `## M2`, … Act on each new one; an orchestrator message overrides your task text.
- **Outbox (you → orchestrator):** `status.md` on your notes branch `claude/notes-<task-id>` (in `/tmp/notes`,
  `git -C /tmp/notes checkout -B claude/notes-<task-id>` at the start of your run). Append one line per checkpoint and
  push it: `- <UTC time> <step done> → <next step>`. Acknowledge each inbox message as `- ACK M<n>: <what you did>`.
- **Questions:** append `- QUESTION Q<n>: <question> | default: <what you will do>` and push. If you can keep going
  on other work, do that and check the inbox at each checkpoint. If the question blocks you, check the inbox every 2
  minutes for up to 20 minutes (`sleep 120` in a loop), then take your default and record that you did.

## Standards

1. Read the instruction files in `.github/instructions/` that apply to what you touch (layering, `@critical`
   invariants, store hazards, test conventions) and obey them.
2. **Desktop is the spec.** Mirror command shapes, field defaults, permission gating, labels and confirmation flows.
3. Layering: UI → `useWebClient().request.<scope>.<method>` (Sockatrice) → server; inbound → Datatrice `*ResponseImpl`
   → Redux; UI reads selectors. Webatrice boundaries enforced by `eslint.boundaries.mjs` (feature→feature imports are errors).
4. Tests: co-located `*.spec.ts(x)` for every new builder/reducer/selector/hook/component; integration specs where a
   protocol round trip matters. `vi.clearAllMocks`, never `resetAllMocks`. Never `.skip` a test to get green.
5. i18n: strings in co-located `*.i18n.json`, namespaced keys; never hand-edit `src/i18n-default.json` (regenerated).
6. Forms: react-hook-form + zod. Large live lists: `VirtualList`.
7. One `.changeset/<kebab>.md` per published package changed (`'@cockatrice/<pkg>': patch|minor` + user-facing paragraph).
   New response-interface members are **optional** (additive, non-breaking).
8. Conventional commits (`feat(game): …`), body explains why, last line exactly
   `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
9. e2e specs import `test` from `packages/webatrice/e2e/fixtures/test.ts` (hermetic network fixture; lint enforces it
   once the e2e-hardening branch is in your base).

## Gate (all must pass; run from repo root)

```
git submodule update --init && npm ci          # after any rebase or lockfile change
npx turbo run typecheck --concurrency=1
npm run lint
npm test -- -- --maxWorkers=2
npm run test:integration -- -- --maxWorkers=2
npm run test:e2e -w @cockatrice/sockatrice      # when sockatrice/server flows change
npm run test:e2e -w @cockatrice/webatrice       # when user-visible server flows change (chromium+firefox+webkit, ~7 min)
```

**Browsers:** the machine's own Playwright browsers do not match 1.60 and will not launch. Run the browser part of e2e
inside the pre-pulled image: `npm run build -w @cockatrice/webatrice && npm run test:e2e:up -w @cockatrice/webatrice`, then
`docker run --rm --network host --ipc=host -v "$PWD":"$PWD" -w "$PWD/packages/webatrice" mcr.microsoft.com/playwright:v1.60.0-noble npx playwright test`,
then `npm run test:e2e:down -w @cockatrice/webatrice`. (Start Docker first with `sudo dockerd >/tmp/dockerd.log 2>&1 &` if `docker info` fails.)

The machine is yours alone: no e2e lock needed. Docker and the 3.0.0 Servatrice/MySQL/Playwright images are
pre-pulled. For 3.1-only e2e (reports, staff tools): build the master image once —
`docker build -t webatrice-local/servatrice:master-add65ca /tmp/cockatrice` (needs the full checkout above; ~15–25 min) —
then `SERVATRICE_IMAGE=webatrice-local/servatrice:master-add65ca npm run test:e2e -w ...`. Skip it if your task doesn't need it.

## Deliverables

1. Your branch pushed with the final commits.
2. Your PR description committed to the notes area: write it to `/tmp/pr.md`, then
   `git -C /tmp/notes checkout -B claude/notes-<task-id> && cp /tmp/pr.md /tmp/notes/prs/<pr-file-name>.md &&
   git -C /tmp/notes add -A && git -C /tmp/notes commit -m "notes: <task-id>" && git -C /tmp/notes push origin HEAD:claude/notes-<task-id>`
   Format: `# <title>` / `## Summary` / `## Parity rows closed` / `## Desktop reference` / `## Testing` (exact counts) /
   `## Notes for reviewers`.
3. FINAL message (under 300 words): branch + tip SHA, gate results with counts, decisions made, follow-ups.
