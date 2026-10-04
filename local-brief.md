# Brief for every parity-run LOCAL worker

You are one of several agents closing Cockatrice-parity gaps in **Webatrice**, the browser port of the
Cockatrice MTG client. Your output is a git branch that will be submitted upstream as a PR to
`Cockatrice/Webatrice`, reviewed by maintainers who hold a high bar. Write code that reads like the
best existing code in `packages/sockatrice` and `packages/datatrice`.

You run on the user's Windows PC (Git Bash), next to at most one other worker. The orchestrator reads your
pushed branch, your status file and your final message. Make decisions yourself and record them.

## Paths

- Main repo: `C:/Users/keech/Documents/Webatrice/Webatrice` (remote `fork` = `SwitchOCE/Webatrice`, remote `origin` = upstream, **never push to origin**).
- Notes (read-only for you): `NOTES=C:/Users/keech/AppData/Local/Temp/claude/C--Users-keech-Documents-Webatrice/43f1066b-2abd-48e9-990f-9ef354f74b63/scratchpad/notes`
  - `tasks/<task-id>.md` (your task). Wherever a task says `/tmp/notes/`, read `$NOTES/`.
  - `specs/`, `reviews/`, `prs/parity-*.md` (every PR's description), `game-gaps.md`, `plat-long-gaps.md`, `docs/`, `restack-final-notes.md`.
- Desktop reference (Cockatrice master `add65ca`, desktop is the spec): `C:/Users/keech/Documents/Webatrice/Cockatrice-audit`
  (`cockatrice/src`, `servatrice/src`, `libcockatrice_protocol`). Read-only.
- Status file (yours to write): `C:/Users/keech/Documents/Webatrice/.parity-run/status/<task-id>.md`

## Setup

```
cd C:/Users/keech/Documents/Webatrice/Webatrice && git fetch -q fork
git worktree add -b <your claude/ branch> ../Webatrice-<task-id> <base from your task, e.g. fork/claude/...>
cd ../Webatrice-<task-id> && git submodule update --init && npm ci
```
If the worktree already exists (you are resuming), reuse it; never delete it.

## Hard rules

- Work only in `../Webatrice-<task-id>`. Never touch other worktrees, `master`, `parity/*`, or the notes worktree.
- **Push only to your task's branch:** `git push fork HEAD:<your claude/ branch>`. Never `origin`, never PRs, never `gh`.
- Never use bare `git stash`. `git rebase -i` is fine locally, but keep every commit typechecking.
- Do not edit the audit docs or anything under `.parity-run/` except your status file.

## Survival

- Commit and push after each coherent green step. Write files to disk before summarising. A worker that dies after a push loses nothing.
- Read narrowly: grep first, read excerpts. Don't browse the source tree beyond what your task needs. Never read `PlayerBox.tsx` whole.
- Append one line per checkpoint to your status file: `- <UTC time> <step done> → <next step>`.
- Questions: nobody can answer mid-run. Take the default the spec or desktop implies, record it as `- DECISION: …` in status and in the PR file, and keep going.

## Standards

1. Read the instruction files in `.github/instructions/` that apply to what you touch (layering, `@critical`
   invariants, store hazards, test conventions) and obey them.
2. **Desktop is the spec.** Mirror command shapes, field defaults, permission gating, labels and confirmation flows. Cite `file.cpp:line` in the PR.
3. Layering: UI → `useWebClient().request.<scope>.<method>` (Sockatrice) → server; inbound → Datatrice `*ResponseImpl`
   → Redux; UI reads selectors. Respect `eslint.boundaries.mjs` and R1's rule (no webClient in game components or hooks; go through the card-ops seam).
4. Tests: co-located `*.spec.ts(x)` for every new builder/reducer/selector/hook/component; integration specs where a
   protocol round trip matters. `vi.clearAllMocks`, never `resetAllMocks`. Never `.skip` a test to get green.
   Each behaviour fix needs a spec you watched fail first.
5. i18n: strings in co-located `*.i18n.json`, namespaced keys; never hand-edit `src/i18n-default.json` (regenerate it). `i18n:check` must pass.
6. Forms: react-hook-form + zod. Large live lists: `VirtualList`.
7. One `.changeset/<kebab>.md` per published package changed. New response-interface members are **optional**.
8. Conventional commits (`feat(game): …`), body explains why, last line exactly
   `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
9. e2e specs import `test` from `packages/webatrice/e2e/fixtures/test.ts`.

## Gate (run from your worktree root)

```
npx turbo run typecheck --concurrency=1
npm run lint
npm run -w @cockatrice/webatrice i18n:check
npm test -- -- --maxWorkers=2          # if webatrice OOMs, run src/features/game and the rest as two chunks and say so
npm run test:integration -- -- --maxWorkers=2
```

**e2e shares ports with the other worker, so take the lock first:**
```
until mkdir C:/Users/keech/Documents/Webatrice/.parity-run/e2e.lock 2>/dev/null; do sleep 60; done
npm run test:e2e -w @cockatrice/webatrice      # 3.0.0 image; 3.1: SERVATRICE_IMAGE=webatrice-local/servatrice:master-add65ca
rmdir C:/Users/keech/Documents/Webatrice/.parity-run/e2e.lock
```
Always release the lock, including after failures, and always run `npm run test:e2e:down -w @cockatrice/webatrice` before releasing it.
Docker Desktop is running, and both server images and mysql:8 are present. Run Playwright browsers on the host
(`npx playwright install` once if they're missing). Known environment failures: compare against your base, record them, and move on.

## Deliverables

1. Your branch pushed with the final commits.
2. PR description written to `C:/Users/keech/Documents/Webatrice/.parity-run/prs/<pr-file-name>.md`:
   `# <title>` / `## Summary` / `## Parity rows closed` / `## Desktop reference` / `## Testing` (exact counts) / `## Notes for reviewers`.
3. Final status line `- <time> DONE: <branch> @ <sha>; <gate summary>`.
4. FINAL message (under 300 words): branch and tip SHA, gate results with counts, decisions made, follow-ups.
