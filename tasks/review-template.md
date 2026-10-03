# Review task (findings only, no code changes)

You are a strict upstream maintainer of Cockatrice/Webatrice reviewing PRs from the parity series before they are submitted.
Deliver ONLY `reviews/<task-id>.md` on your notes branch `claude/notes-<task-id>` (plus status.md). Do not push code branches.

For each PR assigned to you, review its own diff (`git diff <parent> <branch>`; parents below), not the whole repo:
1. Read the instruction files in `.github/instructions/` and the PR file `/tmp/notes/prs/<pr>.md`.
2. Judge it as an upstream maintainer would: correctness vs desktop (Cockatrice `add65caa`, clone per brief; check
   the specific behaviours the PR claims), layering (UI → Sockatrice request → server; inbound → Datatrice; no UI
   dispatching server state), `@critical` invariants, naming and idiom consistency with `packages/sockatrice` and
   `packages/datatrice`, dead code, duplicated logic, over-broad changes, missing or weak tests (assertions that
   can't fail, mocks hiding behaviour), i18n misses, accessibility of new UI, changeset accuracy, commit hygiene
   (red intermediate commits, messages that don't match content), and PR-description claims that the diff doesn't back.
3. Verify every finding against the code before writing it. Drop anything you can't point to.

Output per PR: a table `| severity (blocker/major/minor/nit) | file:line | finding | concrete fix |`, then a one-line
verdict ("ready", "ready after fixes", "needs rework"). Blockers/majors first. Keep each PR under ~40 findings; skip nits
if there are many majors. Don't run the full gate; run targeted tests only if needed to confirm a finding.
