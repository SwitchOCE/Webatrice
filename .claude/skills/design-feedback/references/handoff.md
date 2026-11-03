# Branches, commits and the PR

The designer sees none of this except the two go-ahead questions and the final link.

## 1. Working branch (start of the first real-app mock in a round)

```bash
git switch --no-track -c design-feedback/<yyyy-mm-dd>-<topic> <upstream>/design/redesign
```

Always `--no-track`: without it the branch tracks `design/redesign`, and a bare `git push` would go to the main line.

- If the harness needs seed data, commit it first, alone: `wip: harness seed`. Note its SHA in `tracker.md`.
- **One item at a time.** Finish an item's real-app mock (Approved or Parked) before editing code for the next one.
- **Approved** → commit only that item's files: `git add <files>` then a conventional commit, e.g.
  `style(webatrice): move the logo to the right of the rail toggle`. Body: the designer's feedback in one or two lines and the spec's "Done when". Record the SHA against the item in `tracker.md`.
- **Parked** → `git restore` that item's files. The spec and screenshots stay in `.design-feedback/`.
- Never commit anything under `.design-feedback/`, copies of `shoot.mjs`, or screenshots.

## 2. On "submit"

1. Group Approved items into PRs by area (left nav, top bar, dashboard welcome card, dashboard sections, game card, right column, visual bugs). Up to ~6 items per PR. Items whose commits touch the same files stay in one PR.
2. For each PR, build a clean branch:
   ```bash
   git switch --no-track -c design-feedback/<yyyy-mm-dd>-<area> <upstream>/design/redesign
   git cherry-pick <item commit SHAs, in order>
   ```
   The `wip: harness seed` commit is never picked. A conflict means the items belong together: abort and merge the groups.
3. Run the checks in [screen-map.md](screen-map.md#checks-before-handoff) on each branch. Fix in a new commit on that branch.
4. Retake the after-screenshots on the clean branch (with the seed applied locally and uncommitted if needed: `git cherry-pick -n <seed SHA>`, shoot, then `git restore --staged --worktree packages/webatrice/layout-tests`).
5. If any item was specified in Brilliant, export the designer's final frames ([brilliant.md](brilliant.md#3-hand-off-the-final-frames)) and note which frame belongs to which item. Reviewers can't open the designer's Brilliant project, so these PNGs are the only record of the frames.
6. Show the designer the list: PR title, the items in it, and say where it will go. If the export printed `SHARE`, add that request in one sentence. Ask: **"Push these branches and open the PRs?"** (*Yes / Not yet*). Wait for yes.

## 3. Push and open

- Push with an explicit remote and branch (`git push mine <branch>`), to the designer's own fork, never to `SwitchOCE/Webatrice` directly (its branch list is kept to the main lines). If the designer has no fork: `gh repo fork SwitchOCE/Webatrice --remote --remote-name mine` (only after their yes above).
- Screenshots: put the round's before/after PNGs on a branch of the designer's fork that holds only images, then reference them by URL:
  ```bash
  git worktree add --orphan -b design-feedback-assets ../webatrice-assets   # first time only
  ```
  Copy PNGs to `../webatrice-assets/<round>/`, and the Brilliant frames from `.design-feedback/<round>/brilliant/final/*.png` to `../webatrice-assets/<round>/brilliant/`. Commit, `git push mine design-feedback-assets`, and use `https://github.com/<designer>/Webatrice/raw/design-feedback-assets/<round>/<file>.png`. Remove that worktree afterwards (`git worktree remove ../webatrice-assets`). Images stay off the PR branch so they don't land in `design/redesign` on merge; GitHub has no API for attaching images to a PR body. If this fails, open the PR without images and tell the designer which files to drag into which heading; for a Brilliant item the frame PNG is required, so don't call the PR ready until it's attached.
- Open the PR against `SwitchOCE/Webatrice`, base `design/redesign`:
  `gh pr create --repo SwitchOCE/Webatrice --base design/redesign --head <designer>:<branch> --title "<area>: <summary>" --body-file <file>`
- If `gh` isn't available or signed in, give the designer the compare link and the body text to paste.

## PR body

```markdown
Design feedback from <designer>, <date> (<source: Notion doc / chat>).

## <n>. <item title>
> <designer's original words>

**Change:** <spec Change line>
**States / widths:** <if any>
**Done when:** <spec Done when>

| Before | After |
|---|---|
| ![](<before url>) | ![](<after url>) |

<!-- For an item specified in Brilliant, use three columns instead, one row per frame: -->
| Before | Brilliant frame | Built |
|---|---|---|
| ![](<before url>) | ![](<frame url>) | ![](<after url>) |

*Brilliant frame "<frame name>" (`<frame id>`), canvas `<canvas id>`.*
<details><summary>What changed in Brilliant</summary>

```
<diff.mjs lines>
```
</details>

## Needs developer (not in this PR's code)
### <item title>
> <designer's words>

<spec, plus the wireframe image>

## Brilliant source (if any item was specified in Brilliant)
Project "<name>" (<backing>, handle <handle> if synced), canvas `<canvas id>`; frames listed under each item.
<If backing is local:> This project is local to <designer>'s machine, so the frames can't be opened from here; the PNGs above are the record. <designer> has been asked to share it (synced or cloud project) or send the project folder.

## Checks
typecheck, lint, i18n:check, related unit tests: <pass / what failed and why>
```

A "Done when" that cites a Brilliant frame points at its image in this PR ("matches the Brilliant frame above"), never at a frame title alone.

## 4. Afterwards

- Mark the items **In PR** with the link, in `tracker.md` and to the designer.
- A Needs developer item with no PR for its area goes into a GitHub issue on `SwitchOCE/Webatrice` with the same block, after the designer's yes.
- Delete local branches whose PRs are merged when the designer next starts a round.
