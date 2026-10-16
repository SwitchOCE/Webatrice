# Screen map and code rules (for you, not the designer)

Paths are under `packages/webatrice/src/`. This saves you exploring; verify a file still exists before editing it.

## Where things are

| Area | Files |
|---|---|
| Page frame (rail + top bar + content) | `feature-wrappers/layout/Layout.tsx` |
| Left nav (rail), logo, collapse button, avatar | `feature-wrappers/layout/NavRail.tsx`, `navPlaces.ts` (items), `railToggle.ts` (collapse state), `logo.png` |
| Top bar: section labels, tabs, notifications | `feature-wrappers/layout/TopBar.tsx`, `TabList.tsx`, `topBarTabs.ts` |
| User menu (avatar) | `feature-wrappers/layout/UserMenu.tsx`, `userMenuEntries.ts` |
| Dashboard (home) page | `features/server/Server.tsx`, data in `features/server/useHome.ts` |
| Welcome card | `features/server/components/HomeHero.tsx` |
| Games sections ("Open seats in…", "Hosted by your buddies") | `features/server/components/HomeGames.tsx`, `OpenGames.tsx`, `BuddyGames.tsx`, `GameGrid.tsx`, `HomeEmpty.tsx`, `SectionHead.tsx` |
| Recent decks row | `features/server/components/RecentDecks.tsx` |
| Right column: "From the server", rooms list | `features/server/components/ServerAnnouncement.tsx`, `features/server/RoomsList.tsx`, `BuddiesOnline.tsx` |
| Game card | `components/GameCard/GameCard.tsx`, `gameCardModel.ts` (what it shows) |
| Shared building blocks (buttons, chips, panels) | `components/ds/ds.tsx` |
| Colours, spacing, radii, type | `styles/tokens.css` (+ `services/theme/palettes.ts`, kept in sync), `tailwind.config.ts` |

Anything else: search the visible English text in `**/*.i18n.json`; the file next to it is the component.

## Rules for every change

- **Rendering only.** Visual items change markup, classes and copy. If the change needs new data, a new action or different navigation, it's a Behaviour item: stop and re-tag it.
- **Use the design tokens.** Tailwind classes backed by `tokens.css` (`bg-bg-surface`, `text-text-secondary`, `p-pad`, `rounded-ui`, …). No raw hex, no new tokens without asking the designer, and then add the token to both `tokens.css` and `palettes.ts` for every theme.
- **Reuse before you add.** If another element already has the look the designer wants ("same as the nav items"), share its classes or component rather than copying values.
- **Copy lives in the `*.i18n.json` beside the component.** Change the English there. Then regenerate the combined file with `npm run -w @cockatrice/webatrice translate` and keep only the lines for keys you actually changed in `src/i18n-default.json` (the generator can reorder keys on some systems; revert that noise). Never hand-edit `i18n-default.json`. Removed copy: delete the key.
- **No code comments** unless there's a pressing reason. Design rationale goes in the PR text.
- **Tests that check the old look or words** (`*.spec.tsx` next to the component) get updated in the same change. Don't delete a test to make it pass.
- **Accessibility stays intact**: keep `aria-label`s, focus outlines and contrast. If the designer's request would remove one (e.g. an icon-only button), keep an accessible name and mention it in the PR.
- **Both themes.** Check dark and light when colours, borders or backgrounds change.
- **Line endings.** Edit files with the Edit tool. Scripted edits (sed, Python, `git show > file`) can leave LF endings in a Windows checkout, and lint then fails with `linebreak-style`. The commit is fine either way; fix the working copy with `git checkout -- <file>` after committing, or run `npm run -w @cockatrice/webatrice lint:fix`.

## Checks before handoff

From the repo root:

```bash
npm run -w @cockatrice/webatrice typecheck
npm run -w @cockatrice/webatrice lint
npm run -w @cockatrice/webatrice i18n:check
```

From `packages/webatrice`:

```bash
node ../../node_modules/vitest/vitest.mjs related --run --maxWorkers=6 <changed source files>
```

Fix what fails. If something fails that your change didn't touch, note it in the PR instead of fixing it.
