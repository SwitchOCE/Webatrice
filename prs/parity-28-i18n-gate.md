# feat(i18n): i18n CI gate, no-literal-string lint, and platform string extraction

> **Stacks on `claude/restack-23-playmats`** (`13351fd`). Branch `claude/parity-28-i18n-gate` (tip `b8cabd1`). Audit PR "D1" (`specs/aud.md` §2.1, §2.3–§2.5, §3 row D).

## Summary
- **Live key bugs fixed.**
  - The password-reset toast called `Login.toasts.passwordResetSuccess`, but the catalogue had `passwordResetSuccessToast`, so it showed the raw key. The JSON key is renamed.
  - Three Settings sections (General, Card Sources, Storage) took their titles from keys that were never added, so the nav and headings showed `Settings.section.general` and so on. The checker found this; the audit did not list it.
  - `Logs.title` was missing and hidden by a `defaultValue`. It is now defined and the `defaultValue` is gone.
  - Orphan keys are deleted: `Common.language`, `ManageSets.saved`, `KnownHostForm.help`, `Moderation.common.error`, `ShortcutsTab.resetAll`, `Player.action.message` and `Settings.navLabel`. CountryDropdown now uses the orphaned `Common.label.country`, plus a new `Common.label.none`.
- **`npm run i18n:check`** (`packages/webatrice/scripts/check-i18n.mjs`, TypeScript compiler API, pure core with a co-located spec). It fails on:
  - (a) a literal `t('A.b')`, `i18nKey="A.b"` or `*Key: 'A.b'` (when the value names a catalogue namespace) with no message, or one that passes `defaultValue` for a catalogue namespace;
  - (b) a template key `t(\`A.b.${x}\`)` with no key under its prefix;
  - (c) an orphan key. Keys reached as data count as used: any string literal, a template head (`\`CardImportForm.steps.${key}\``) or a `${prefix}.tail` pattern. `scripts/i18n-allowlist.json` (`{ key: reason }`) covers the rest. Today that is only `Unsupported.missing`, which `public/preflight.js` reads before i18next exists;
  - (d) an English message that is not valid ICU. It is parsed with `ignoreTag`, the way i18next-icu formats, so `<Trans>` placeholders count as text;
  - (e) a committed `src/i18n-default.json` that differs from a fresh merge;
  - (f) `public/locales/*` folders that do not match the `Language` enum.
- **CI and scripts.** CI gets a new step in the `lint` job, after "Webatrice lint". It first runs `git diff --exit-code` on the rollup that "Install packages" just regenerated (that regeneration would otherwise hide (e)), then runs `i18n:check`. The check is also part of `golden` / `golden:coverage`. `lint` now covers `scripts/`, and vitest includes `scripts/**/*.spec.mjs`.
- **`eslint-plugin-i18next` `no-literal-string`** (new devDependency `^6.1.5`). The configuration:
  - mode: `jsx-only`, checking JSX text and the attributes `title`, `aria-label`, `placeholder`, `label`, `helperText` and `alt`;
  - template literals: validated;
  - words excluded: text with no letters, all-caps text, `Webatrice` and `TCGplayer`;
  - also excluded: `<code>` contents and `kind`/`type` object properties.

  The rule is `error` on all of `src/**/*.tsx` except an explicit off-list of `features/game/**` and `features/decks/**` (about 430 and 250 hits today). Each later PR removes its folder from that list. `features/rooms` and `features/developer` are on, because both are clean now.
- **Shared `Common.action.{cancel,close,create,send,apply,reset,join,dismiss}`.** Used by the rooms dialogs, the games list, room and private chat, DialogShell, Toast and PromptDialog.
- **Platform extraction: 156 keys added, 8 removed (catalogue 1399 → 1547).** The English text is unchanged everywhere.
  - **Rooms:** `CreateGameDialog.*`, `FilterGamesDialog.*` (ICU plurals for the max-age options), `GamesList.*` (columns, heading, a `<Trans>` empty-state sentence instead of fragments, toolbar, password and error dialogs), `RoomChat.*` and `RoomUsers.*`. The Restrictions and Spectators cells (`formatRestrictions` / `formatSpectators`, which the user-games dialog shares) now take `t` and use `GameInfo.*`, with a new `gameInfo.spec.ts`.
  - **TopBar (string extraction only, because PRs 26/27 also touch it):** `TopBar.tab.*` (Lobby, `Room {id}`, `Game {id}`, `Deck #{id}`, My Decks, Player), `TopBar.connection.*`, the Decks button, Close tab, the game toggles and Sign out. The staff and page tabs reuse the existing `UserMenu.*` keys. Ids are passed as strings so ICU does not group them ("Game 1,234").
  - **Components:** `CardDetails.label.*` (shared with TokenDetails), `CardRelatedLinks.*` (ICU plural), `UserBadges.*` and `UserActionsMenu.*`; DialogShell, Toast and PromptDialog use `Common.action.*`.
  - **Lobby and the rest:** `RoomsList.*`, `Server.announcements`, `ServerUsers.*`, `PrivateChat.*`, `Account.addUser.submit`, `KnownHosts.edit`, `CardImportForm.os.*` / `.message.saveFailed`, `Common.label.logo`, `Login.showcase.avatarAlt` and `Reports.userContext.recentLine`. `Logs.tabWithCount` replaces `Room Logs` + ` [2]` concatenation.
- **Dead code deleted.** `rooms/components/GameSelector/*`, `OpenGames` and `SayMessage` were imported only by their own specs (GamesList and RoomChat replaced them), so they are deleted rather than translated, along with their unit specs and three integration cases.

## Parity rows closed
- **LONG-016** (Localization): **partial → closer.** "Missing-key checks run in CI" is now done. Hard-coded strings in route, nav, account, rooms and component code are gone, and lint now blocks new ones. Still open: the game tree (D3, about 670) and decks (D2, about 230), each gated by the off-list, plus the locale-completeness threshold (§2.4).

## Desktop reference
- The desktop UI goes through Qt `tr()`, with `cockatrice/translations/cockatrice_*.ts` as the catalogues. The `GameInfo.*` strings mirror desktop `GamesModel::data` (`password`, `buddies only`, `reg. users only`, `can chat`, `see hands`, `not allowed`).
- **Labels are not re-aligned to desktop here.** The task was extraction, so CreateGame/FilterGames keep the existing web wording (for example "Spectators see everything", where desktop has "Spectators can see &hands"). Aligning the wording is a one-line catalogue change per label, best done with the D2/D3 passes.

## Testing
All run from the repo root on the tip, after `npm ci` (lockfile changed), with Vitest at `--maxWorkers=2`:
- `npx turbo run typecheck --concurrency=1`: 5/5 tasks passed.
- `npm run lint`: 3/3 packages, 0 problems. As a check, the rule fires on JSX text and on a `title` attribute when they are added to a migrated file.
- `npm run -w @cockatrice/webatrice i18n:check`: 79 catalogues, 539 sources, all keys resolve.
- `npm test`: sockatrice 880 passed; datatrice 1281 passed; webatrice **2211 passed, 2 skipped** (pre-existing `describe.skip` in `features/game`). This includes the 15 `check-i18n.spec.mjs` tests and 5 `gameInfo.spec.ts` tests.
- `npm run test:integration`: sockatrice 171; datatrice 140; webatrice **206 passed, 2 skipped** (pre-existing).
- `npm run test:e2e -w @cockatrice/webatrice`: built on the host. The browsers ran inside `mcr.microsoft.com/playwright:v1.60.0-noble` against Servatrice 3.0.0: **51 passed, 6 failed, 6 skipped** (63 tests in 13.3 min). Neither failing spec is caused by this branch:
  - `replays.spec.ts` "a finished game can be … watched from the Replays tab" fails on all 3 browsers (the local `replay_N.cor` never appears). It **fails the same way on the base `13351fd`**, which I re-ran on chromium.
  - `staff-tools.spec.ts` fails on all 3 browsers with `spawnSync docker ENOENT`. Its SQL seeding needs the docker CLI, which this container run did not mount (environment).

  No English text changed, so no e2e assertion needed updating.
- Specs that asserted English now assert keys or roles. The test i18n instance echoes keys, so the counted log-tab label is asserted by its key, and the tabs are selected by position.

## Notes for reviewers
- **Changeset:** `.changeset/i18n-platform-gate.md` (`@cockatrice/webatrice`: patch).
- **The checker is heuristic in one direction.** Any string literal equal to a key counts as a use, so a key can never be falsely flagged as an orphan when it is passed around as data. The cost is that a key that only appears in some unrelated string is not flagged. Missing-key detection covers literal `t()` / `i18nKey` and `*Key` props that name a catalogue namespace. `t(variable)` is out of reach of a static check.
- **Rollup staleness in CI** is caught by the `git diff` step, because `install-packages` regenerates the rollup before lint. The in-script check (e) covers local runs.
- **Rule scope.** `jsx-only` does not see literals in plain `.ts` (column definitions, toasts built outside JSX). The checker cannot see them either. Those were reviewed by hand for the migrated folders.
- **Persisted tab titles.** Sticky deck tabs persist their title, so a `Deck #4` fallback saved in one language stays until the deck list re-titles it. That is the existing behaviour, now in the user's language.
- **Follow-ups (not in this PR):**
  - D2 decks and D3 game menus/dialogs, each deleting its folder from the off-list;
  - `ReportQueue` " (…)" and `ReportStatsPanel` text-block concatenation;
  - the `roomPermission` "none" fallback and server-provided permission names;
  - the locale completeness threshold;
  - `renderWithProviders` still uses `en-US` (§2.4);
  - desktop label wording for CreateGame/FilterGames.
