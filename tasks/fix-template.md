# Fix task (apply review findings to finished PR branches)

A strict review of your PR(s) is in `/tmp/notes/reviews/<rvN>.md`, with one section per PR. Apply the findings your task lists.

How:
- Work on the PR branch itself: `git checkout -b work origin/parity/<NN-name>`. Fix each finding as its own commit on top
  (a conventional message saying what was wrong). The exception is where the review says to squash or fold red
  intermediate commits: do that with `git rebase -i` (script GIT_SEQUENCE_EDITOR; use fixup/squash only, never drop
  work) so that every commit typechecks. Verify this by running `npx turbo run typecheck --concurrency=1` at each commit
  of the rewritten range (`git rebase -x "<cmd>"` is fine).
- Keep the PR's scope: fix what the review found and don't refactor beyond it. If you disagree with a finding after
  checking the desktop/Servatrice source, don't apply it. Say why under "Review response" in the PR file.
- Add or adjust tests for every behaviour fix. Each test must fail before the fix.
- Push the full rewritten branch to `claude/parity-<NN-name>` with `--force-with-lease` (it is yours for this run).
- Update the PR file (`/tmp/notes/prs/parity-<NN-name>.md`): fix any claim the review showed is false, and add a
  short "Review response" section (finding → what changed, or why not). Testing counts must reflect the final tip.
- Keep the branch's parent unless your task says otherwise. Branches stacked above will be restacked later.

Gate on the final tip: the full gate. Run e2e only if you changed user-visible server flows (then webatrice e2e on all browsers).
