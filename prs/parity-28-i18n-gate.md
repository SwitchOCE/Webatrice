# feat(i18n): i18n CI gate, no-literal-string lint, and platform string extraction

> **Stacks on `claude/restack-23-playmats`** (`13351fd`). Branch `claude/parity-28-i18n-gate` (tip `4365b3b`). Audit PR "D1" (`specs/aud.md` §2.1, §2.3–§2.5, §3 row D).

## Summary
- **Live key bugs fixed.**
  - The password-reset toast called `Login.toasts.passwordResetSuccess`, but the catalogue had `passwordResetSuccessToast`, so it showed the raw key. The call site now uses `passwordResetSuccessToast`, the key all 12 shipped locales already translate.
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
  - mode: `jsx-only`, checking JSX text and the attributes `title`, `aria-(label|description|roledescription|valuetext|placeholder)`, `placeholder`, `.*[lL]abel` (so `label`, `submitLabel` and the like), `helperText`, `alt` and `message`. The plugin full-matches these patterns;
  - template literals: validated;
  - words excluded: text with no letters, and the brand names `COCKATRICE`, `Webatrice` and `TCGplayer`;
  - also excluded: `<code>` contents and `kind`/`type` object properties.

  The rule is `error` on all of `src/**/*.tsx` except an explicit off-list of `features/game/**` and `features/decks/**` (about 430 and 250 hits today). Each later PR removes its folder from that list. `features/rooms` and `features/developer` are on, because both are clean now.
- **Shared `Common.action.{cancel,close,create,send,apply,reset,join,dismiss}`.** Used by the rooms dialogs, the games list, room and private chat, DialogShell, Toast and PromptDialog.
- **Platform extraction: 154 keys added, 7 removed (catalogue 1399 → 1546).** The English text is unchanged everywhere.
  - **Rooms:** `CreateGameDialog.*`, `FilterGamesDialog.*` (ICU plurals for the max-age options), `GamesList.*` (columns, heading, a `<Trans>` empty-state sentence instead of fragments, toolbar, password and error dialogs), `RoomChat.*` and `RoomUsers.*`. The Restrictions and Spectators cells (`formatRestrictions` / `formatSpectators`, which the user-games dialog shares) now take `t` and use `GameInfo.*`, with a new `gameInfo.spec.ts`. The spectator cell picks one of three whole messages (`{count} (can chat)`, `{count} (can see hands)`, `{count} (can chat & see hands)`), worded as desktop. The user counts (`RoomUsers`, `ServerUsers`, `RoomsList.available`) are ICU plurals, and the chat subtitles' `·` separator is rendered in JSX (`aria-hidden`), outside the message.
  - **TopBar:** `TopBar.tab.*` (Lobby, `Room {id}`, `Game {id}`, `Deck #{id}`, My Decks, Player), `TopBar.connection.*`, the Decks button, Close tab, the game toggles and Sign out. The staff and page tabs reuse the existing `UserMenu.*` keys. Ids are passed as strings so ICU does not group them ("Game 1,234"). Page tabs store a `titleKey` plus params, not the translated text, and the tab list translates them at render time, so sticky and persisted tabs follow a language switch. Only real names (deck, player) are stored as text; tabs persisted by earlier builds are re-derived from their route on load.
  - **Components:** `CardDetails.label.*` (shared with TokenDetails), `CardRelatedLinks.*` (ICU plural), `UserBadges.*` and `UserActionsMenu.*`; DialogShell, Toast and PromptDialog use `Common.action.*`.
  - **Lobby and the rest:** `RoomsList.*`, `Server.announcements`, `ServerUsers.*`, `PrivateChat.*`, `Account.addUser.submit`, `KnownHosts.edit`, `CardImportForm.os.*` / `.message.saveFailed`, `Login.showcase.avatarAlt` and `Reports.userContext.recentLine` (whose report status and category are translated through `Reports.status.*` / `ReportUserDialog.categoryLabel.*`, falling back to the server's code). The logo is decorative (`alt=""`, audit P15), since the brand text sits next to it. `Logs.tabWithCount` replaces `Room Logs` + ` [2]` concatenation.
- **Dead code deleted.** `rooms/components/GameSelector/*`, `OpenGames` and `SayMessage` were imported only by their own specs (GamesList and RoomChat replaced them), so they are deleted rather than translated, along with their unit specs and three integration cases.

## Parity rows closed
- **LONG-016** (Localization): **partial → closer.** "Missing-key checks run in CI" is now done. Hard-coded strings in route, nav, account, rooms and component code are gone, and lint now blocks new ones. Still open: the game tree (D3, about 670) and decks (D2, about 230), each gated by the off-list, plus the locale-completeness threshold (§2.4).

## Desktop reference
- The desktop UI goes through Qt `tr()`, with `cockatrice/translations/cockatrice_*.ts` as the catalogues. The `GameInfo.*` strings mirror desktop `GamesModel::data` (`games_model.cpp:196-218`: `password`, `buddies only`, `reg. users only`, `open decklists`, `(can chat)`, `(can see hands)`, `(can chat & see hands)`, `not allowed`).
- **Labels are not re-aligned to desktop here.** The task was extraction, so CreateGame/FilterGames keep the existing web wording (for example "Spectators see everything", where desktop has "Spectators can see &hands"). Aligning the wording is a one-line catalogue change per label, best done with the D2/D3 passes.

## Testing
All run from the repo root on the tip `4365b3b`, after `npm ci` (lockfile changed), with Vitest at `--maxWorkers=2`:
- `npx turbo run typecheck --concurrency=1`: 5/5 tasks passed.
- `npm run lint`: 3/3 packages, 0 problems. As a check, the rule fires on JSX text, a `title` attribute, and `submitLabel`, `message`, `aria-description` and `aria-valuetext` literals, plus all-caps text such as `MLD`, when they are seeded into a migrated folder.
- `npm run -w @cockatrice/webatrice i18n:check`: 79 catalogues, 539 sources, all keys resolve.
- `npm test`: sockatrice 880 passed; datatrice 1281 passed; webatrice **2216 passed, 2 skipped** (pre-existing `describe.skip` in `features/game`). This includes the 15 `check-i18n.spec.mjs` tests and 7 `gameInfo.spec.ts` tests.
- `npm run test:integration`: sockatrice 171; datatrice 140; webatrice **206 passed, 2 skipped** (pre-existing).
- `npm run test:e2e -w @cockatrice/webatrice`: not re-run after the rv12 fixes, which change no e2e-asserted text (the tab titles, toast and counts render the same English). The earlier run, on `b8cabd1`, was built on the host. The browsers ran inside `mcr.microsoft.com/playwright:v1.60.0-noble` against Servatrice 3.0.0: **51 passed, 6 failed, 6 skipped** (63 tests in 13.3 min). Neither failing spec is caused by this branch:
  - `replays.spec.ts` "a finished game can be … watched from the Replays tab" fails on all 3 browsers (the local `replay_N.cor` never appears). It **fails the same way on the base `13351fd`**, which I re-ran on chromium.
  - `staff-tools.spec.ts` fails on all 3 browsers with `spawnSync docker ENOENT`. Its SQL seeding needs the docker CLI, which this container run did not mount (environment).

  No English text changed, so no e2e assertion needed updating.
- Specs that asserted English now assert keys or roles. The test i18n instance echoes keys, so the counted log-tab label is asserted by its key, and the tabs are selected by position.

## Notes for reviewers
- **Changeset:** `.changeset/i18n-platform-gate.md` (`@cockatrice/webatrice`: patch).
- **The checker is heuristic in one direction.** Any string literal equal to a key counts as a use, so a key can never be falsely flagged as an orphan when it is passed around as data. The cost is that a key that only appears in some unrelated string is not flagged. Missing-key detection covers literal `t()` / `i18nKey` and `*Key` props that name a catalogue namespace. `t(variable)` is out of reach of a static check.
- **Rollup staleness in CI** is caught by the `git diff` step, because `install-packages` regenerates the rollup before lint. The in-script check (e) covers local runs.
- **Rule scope.** `jsx-only` does not see literals in plain `.ts` (column definitions, toasts built outside JSX). The checker cannot see them either. Those were reviewed by hand for the migrated folders.
- **Checker blind spots** (documented in the script header): a `*Key` value with a mistyped namespace is skipped rather than reported, and a template prefix marks every key under it as used, so orphans under a dynamic prefix (`ShortcutsTab.action.`, `Reports.queue.`) are not reported.
- **Follow-ups (not in this PR):**
  - D2 decks and D3 game menus/dialogs, each deleting its folder from the off-list;
  - `ReportQueue` " (…)" and `ReportStatsPanel` text-block concatenation;
  - the `roomPermission` "none" fallback and server-provided permission names;
  - the locale completeness threshold;
  - `renderWithProviders` still uses `en-US` (§2.4);
  - desktop label wording for CreateGame/FilterGames.

## Review response (rv12)
- **Finding 1 (password-reset key):** the catalogue key stays `passwordResetSuccessToast`, the one all 12 locales translate, and `useLogin.ts` calls it. A `useLogin.spec.tsx` case fails on the rename.
- **Finding 2 (spectator flags):** `formatSpectators` picks one of three whole messages instead of joining flags with `' & '`. The omniscient-only wording is now desktop's "can see hands". `gameInfo.spec.ts` covers all three.
- **Finding 3 (TopBar titles):** tabs store `titleKey` + `titleParams`, and `TabList` translates them at render time. Real names (deck from `backendDecks`, player) stay text. `flattenDeckNames` no longer bakes in a translated `Deck #N` fallback. Persisted tabs without a `titleKey` (earlier builds) are re-derived from their route on load. A new TopBar spec switches language and asserts that the sticky My Decks tab is retitled.
- **Finding 4 (report context):** status and category go through `Reports.status.*` / `ReportUserDialog.categoryLabel.*` when the catalogue has the code (`i18n.exists`), and show the server's code otherwise. A ReportQueue spec covers both cases.
- **Finding 5 (lint attributes):** `jsx-attributes.include` is widened exactly as proposed. Lint stays at 0 problems, and `BanUserDialog` needed no change: its `text="userName"` props are not in the include list (no pattern matches `text`), so they never fired. No `eslint-disable` was added.
- **Nits:** `words.exclude` has `COCKATRICE` in place of `[A-Z_-]+`. The online/connected/available counts are ICU plurals. The chat-subtitle `·` is in JSX with `aria-hidden`. The logo has `alt=""` and `Common.label.logo` is gone. The script header documents both checker blind spots. `Reports.count` ("{count} report(s)", desktop's wording) is left as is, because the review did not list it.
- Each fix is its own commit on top of `b8cabd1`; no history was rewritten. The parent is still `13351fd`.

## Restack notes (wR3)

Restacked onto the new 27 as `claude/restack-28-i18n-gate` (tip `bcced39`, 17 commits).

Commit changes:
- **Duplicate deletion.** GameSelector, OpenGames and SayMessage were already deleted by 27, so the rooms commit only translates, and its message says so.
- **`9c81e97` dropped.** It was empty once replayed: 27 already made the logo and avatars decorative.
- **New: `fix(game): write the tally count as an ICU plural`,** placed before the gate. `TallyOverlay.selectedCount` used `{{count}}`, which `i18n:check` rejects as malformed ICU.
- **New, last commit: fx16's `a472e86`** (invite-link flake), per M2. The final restack folds it into PR 16.

Resolutions against 26 and 27:
- GamesList keeps 27's grid with `GamesList.column.*`. FilterGamesDialog stays on 26's DialogShell, translated. CreateGameDialog keeps 27's `useId` groups.
- Room and private chat keep 26's `log`/`input` keys, and `placeholder` is dropped.
- DialogShell and Toast use `Common.action.close`/`dismiss`. 26's `DialogShell.close` and `Toast.dismiss` are removed, and the empty DialogShell catalogue is deleted.
- TopBar uses 27's `tabs.close`, and `closeTab` is dropped. The connection status stays 26's persistent region without seconds.
- **`document.title`** is now derived from `tabTitle(tab, t)`, so it follows a language switch. A new TopBar spec checks English then German.
- The deck work's unsaved-deck and public-decks tab titles are keyed (`TopBar.tab.unsavedDeck`, `TopBar.tab.publicDecks`).
- `KnownHosts.edit` keeps 27's `Edit {name}`.
- The specs added since the split (GamesList, Game.seatPrompts, GameLinkJoinHost, DialogShell, DebugLogDialog, Toast, TopBar) now query by i18n keys.

With the rule on, lint reports 0 problems at every commit. No extra platform extraction was needed beyond the two TopBar tab titles.
