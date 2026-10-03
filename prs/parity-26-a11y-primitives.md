# fix(a11y): shared dialog focus, a keyboard menu primitive, live regions and contrast tokens

> **Stacks on claude/restack-23-playmats** (`13351fd`), the tip of the platform chain. Branch `claude/parity-26-a11y-primitives` (tip `9681c1f`, after the rv13 fixes). This is PR **A** of the accessibility split in `/tmp/notes/specs/aud.md` §3; it stays in platform code and touches neither `features/game` nor `features/decks`, so it can be rebased to the end of the series.

## Summary

Audit PR A: the shared primitives the rest of the accessibility work builds on, plus the contrast tokens.

- **`DialogShell` owns a focus model (P4).** The shell gave about seventeen dialogs `role=dialog` and a name, but focus stayed on the page behind: nothing moved it in, Tab walked straight out from under `aria-modal`, and closing left focus on `<body>`. A desktop dialog is its own window, so Qt never had the problem. New hook `hooks/useDialogFocus.ts`, written as a prop getter in the idiom of `useGridRows`:
  - focus moves to `[data-autofocus]`, else the first control of `[data-dialog-content]` (so the header's Close button is never the landing spot), else the first control, else the dialog itself;
  - Tab and Shift+Tab cycle within the dialog over what the browser tabs to, by the `tabbable` library's rules: no disabled or `tabindex=-1` controls (MUI Select's native input included), nothing `[hidden]`/`[inert]`, `display:none` or `visibility:hidden`, one stop per radio group;
  - Escape closes through React rather than a `window` listener, so a dialog opened from inside another closes alone and the outer one stays;
  - the opener is recorded from the focus event that first brings focus into the dialog (its `relatedTarget`), so a dialog whose content has React `autoFocus` (focused in the layout phase, before any effect) still knows where focus came from;
  - closing returns focus to the opener — and only when it is still ours to give, so a dialog that handed focus to another does not yank it back. If the opener has unmounted meanwhile (a virtualized user row scrolled away, a user who left), focus goes to `returnFocusTo(opener)`, recorded at open: by default the opener's nearest landmark or `<main>`; the moderation, user-games and report-user dialogs set `closestList` through `DialogReturnFocusContext`, so focus returns to the user list or chat log;
  - while open, focus that falls to `<body>` (the focused control unmounted) comes back to the top-most dialog, so Escape and the trap keep working;
  - **a dialog that replaces another hands over its opener.** The moderation flow swaps its loading dialog for the form in one commit, and the form's `autoFocus` field takes focus before the loading dialog's cleanup runs. Without the hand-over, closing the form dropped focus on `<body>`. The e2e below found this.
  - The dialog is named by its heading (`aria-labelledby` + `useId`) instead of `aria-label`, and takes an optional `description` (`aria-describedby`) and a pinned `footer`.
- **The two hand-rolled copies move onto the shell (P8).** `FilterGamesDialog` keeps its field layout and submits through `form={id}` from the shell's footer; `SequenceEdit` gains the dialog name it never had, and its recording prompt is now the dialog's description.
- **A shared `Menu` primitive (P5, P6), `components/Menu/`.** `UserActionsMenu` was the only shared menu: it opened only from `onContextMenu` on a `<div>` *inside* the focusable name link, so Shift+F10 and the Menu key never reached it, and **every moderator action, plus "show this user's games", needed a mouse**. The TopBar user menu had no `role=menu`, no Escape, and moved no focus. The primitive follows QMenu / the WAI-ARIA menu pattern:
  - focus moves to the first item on open; ↑/↓/Home/End move and wrap; type-ahead keeps a 500 ms buffer ("mo" reaches "Move to" past "Mulligan"), a repeated letter cycles, a Space inside a live search is part of it (so "move c" never runs "Move to hand" on the way), and the buffer resets whenever the arrows, Home, End or the pointer move focus;
  - submenus (`MenuSubmenu`) open on →, Enter or click (moving focus in) or after resting the pointer on the entry for 200 ms (leaving focus where it is; → still moves in), and close on ← or Escape, with `aria-haspopup`, `aria-expanded` and `aria-controls`. Pointing at a sibling closes an open submenu only after 300 ms, cancelled when the pointer reaches it, so a diagonal path can cross other entries; arrowing (or Home/End) away from a hover-opened submenu's entry closes it at once, as QMenu does when its current action changes. Focus follows the pointer inside a menu, so one row is highlighted. Escape closes one level, Tab closes every level;
  - `MenuItem` closes the whole menu when chosen (`closeOnSelect`, default true, through `MenuLevelContext`); `MenuCheckboxItem` (`menuitemcheckbox`) and the new `MenuRadioItem` (`menuitemradio`, grouped with `MenuGroup`) stay open by default. `MenuSeparator` is a `role=separator`;
  - disabled entries are `aria-disabled`: still focusable (APG), choosing them does nothing, and `disabledReason` is read out through `aria-describedby` (and shown as the tooltip). The report entry on yourself, "Show this user's games" for an offline user and the moderator entries on yourself say why they are off;
  - `shortcut` is the visible, formatted hint and `keyShortcuts` the `aria-keyshortcuts` value, on every item kind. **For PR 30:** don't write them by hand — `useMenuShortcut()` (in `feature-widgets/shortcuts`, beside the shortcuts slice) returns `menuShortcut(actionId) → { shortcut, keyShortcuts }` from the action's current bindings, so a rebinding in the Shortcuts tab updates both; spread it: `<MenuItem {...menuShortcut('game.drawCard')}>`. `useShortcutHints` (the MUI card menu's hints) formats through the same helper;
  - items are found in the DOM and scoped to their own `role=menu`, so **slot entries keep working** — the moderation and user-games entries take part in the roving focus without knowing about the menu;
  - a press outside closes it (attached a frame late, as before), and focus returns to the opener;
  - placement replaces `UserActionsMenu`'s guessed `MENU_W`/`MENU_H` constants: a `{ rect, placement: 'below' | 'right' }` anchor flips to the side with room (above the control, or to a submenu entry's left) and then clamps; a point anchor `{ x, y }` (pointer opens) is a zero-size rect, opening below-right of the point and flipping above or left of it, as `QMenu::popup` does. The menu is measured at its natural height (first pass uncapped at 0,0, placed before paint), not under its own provisional `maxHeight`. `placeMenu` is unit-tested and the result is checked in real browsers at every viewport edge and corner (`e2e/specs/menu-placement.spec.ts`);
  - `useContextMenu()` is the opener: a right-click opens exactly at the pointer (desktop's `popup(event->globalPos())`), **Shift+F10 or the Menu key open below the element** (above it near the bottom of the screen), and a keyboard-raised `contextmenu` event (no pointer position) is anchored to the element's rect rather than the viewport corner. Ctrl/Alt/Meta+Shift+F10 are left alone;
  - focus returns to the opener in a layout-effect cleanup, so a dialog opened by the chosen item in the same commit records the menu's trigger as its opener.
- **"Show this user's games" is on the profile page too (P5).** It was reachable only from the context menu; the Player page now lists it beside buddy, ignore and report, disabled while the user is offline, matching desktop's `aShowGames->setEnabled(online)`.
- **Toasts are announced reliably and actionable ones persist (P11).** Each toast used to mount its own `role=alert` already holding its text *and* set `aria-live=polite` — a conflict screen readers announce unpredictably. `ToastProvider` now renders a persistent "Notifications" region holding two live regions that stay mounted for the app's lifetime: `aria-live=assertive` for errors, `aria-live=polite` for everything else. The auto-hide countdown pauses while the pointer is over a toast or focus is inside it, and resumes with the time that was left (WCAG 2.2.1). `pushToast` takes `persistent`, which `useNotify` sets for any notification with a target and the report notice (`ReportNotifier`) sets too, so a toast that leads somewhere waits to be used or dismissed. Only the newest three persistent toasts show; older ones fold into a "+N more" button that expands the stack. The toast holding focus is never folded away. A pushed toast is removed when it closes, replacing the fixed 11-second cleanup timer.
- **`role=log` on both chats (P9, P10).** Room and private chat scrollers are labelled `role=log` regions that can take focus, their inputs have real labels, and a private-chat bubble names its sender in `sr-only` text, since alignment and colour alone said who wrote it.
- **Live regions stay mounted (P12).** The private-chat blocked notice, the debug-log copy result and the user-games failure keep their region and swap the text, instead of appearing together with it. The TopBar connection dot drops its `aria-label` on a bare SVG for a persistent `role=status` that announces Connected / Server not responding / Disconnected (P16); the seconds counter is left out of the spoken text.
- **Form errors belong to their fields (P14).** `InputField` (Login, Register, Reset, known hosts) and `ReportUserDialog` set `aria-invalid`, point `aria-describedby` at the error, and announce it. The error moves out of the `<label>`, so it is no longer part of the field's accessible name; the label is now tied to the input by `htmlFor`/`useId` rather than wrapping.
- **The page says what language it is in and what page it is (P18).** `useDocumentLanguage` keeps `<html lang>` on the UI language as a BCP-47 tag through `toBcp47` (3.1.1), and `useDocumentTitle` names the tab after the active TopBar tab, or "Login" on the login page (2.4.2).
- **Contrast tokens.** Two new tokens, in `tokens.css`, `palettes.ts` (so the MUI theme follows) and `tailwind.config.ts`:
  - `--text-on-accent` — white on the dark palette's accent was **3.26:1** on every primary button and **2.45:1** on hover. Dark text on the light dark-mode accent gives **5.74:1**, and **7.61:1** on hover; light mode keeps white (**6.42** / **8.40**). Applied to the thirteen primary buttons, `moderationStyles`, and MUI `contained` + `contrastText`.
  - `--border-control` — input, checkbox and MUI outline edges were **1.2–2.3:1** against the field fill and surfaces, where non-text UI needs 3:1 (1.4.11). The new token is ≥3:1 on every surface in both palettes (3.23 at worst); `border-subtle` stays the divider colour. Every input uses it, including the report comment input, the report-queue filters and the shortcut search field; the read-only DebugLog textarea keeps `border-subtle`, since it is not a control you operate. Hover moves to `text-muted`, which is darker still.
  - `text-red-400` errors (**2.32–2.77:1** in light mode; 2.32 on `bg-elevated`) and the report status colours move to the `danger` / `warning` / `success` tokens, and the tab close icon is no longer dimmed to 60% (**2.5:1**).
  - `palettes.spec.ts` gains assertions for on-accent text (≥4.5 on the accent and its hover), control borders (≥3 on all three surfaces) and danger text (≥4.5 on all three).

New strings are in co-located `*.i18n.json` (`DialogShell`, `Toast`, `UserActionsMenu`, and the `TopBar` connection, user and game keys the touched markup needed). The pre-existing `FilterGamesDialog` literals stay as they are — they are listed for PR D, which extracts rooms and TopBar as a batch.

## Parity rows closed

From `aud.md` §1.1, as PR A of §3:

- **P4** — closed. One fix in the shell covers every `DialogShell` dialog: initial focus, trap, restore, `aria-labelledby`, React-tree Escape. The dialog hand-over was an extra case the audit did not see.
- **P5** — closed. The menu opens from the name link on right-click, Shift+F10 and the Menu key; focus-in, roving arrows, type-ahead, `role=separator` and focus return; "Games" added to the Player page. *(Game-side menus are row G4, PR C, which reuses this primitive.)*
- **P6** — closed. The TopBar user menu is a real menu with `aria-haspopup`/`aria-expanded`, Escape, focus move and return; its two toggles are `menuitemcheckbox`. ↓ on the trigger opens it.
- **P8** — closed. Both hand-rolled dialogs are on the shell; `SequenceEdit` has a name and a described recording hint.
- **P9, P10** — closed for both chats.
- **P11** — closed. Persistent regions, pause on hover and focus, actionable toasts persist.
- **P12** — closed for all three sites, plus the user-games failure and the private-chat notice.
- **P14** — closed for `InputField` and `ReportUserDialog`.
- **P16** — closed.
- **P18** — `<html lang>` closed; `document.title` follows the active tab, but most TopBar tab titles are still English literals ('Lobby', 'My Decks', 'Settings', …), so the tab name does not follow a language switch yet. Their extraction is left to PR 28 (i18n gate), which derives tab titles from keys at render time. The third item of that row, **moving focus on route change, is not done**: the TopBar tab model keeps every route's chrome mounted and the pages have no common `<h1>`, so this belongs with the landmark and heading work of PR B.
- **Contrast** — closed for the pairs the audit listed, except the two in `CardImportForm.css` (a hard-coded `#FAFAFA` dropzone and `color: red`), which are card-import rows the audit grouped under P15, and the server-supplied MOTD colours it could not verify. Both are PR B's batch.

## Desktop reference

Cockatrice `add65caa`.

- **Dialogs.** Desktop dialogs are `QDialog` windows: the window manager moves focus in, keeps Tab inside, and returns focus to the parent window on close. `useDialogFocus` is that behaviour inside one browser document — the sanctioned input-model divergence in `webatrice.instructions.md` § *Divergence protocol*, item 3.
- **Menus.** `cockatrice/src/client/ui/user_context_menu.cpp` builds a `QMenu`, which gives arrow keys, type-ahead, submenu →/←, checkable items and focus return for free, and which Qt opens on `Shift+F10` and the Menu key through `QWidget::contextMenuEvent`. The primitive mirrors that, including the "Show this user's games" enablement (`aShowGames->setEnabled(online)`) now also on the profile page.
- **Entry order and labels** in the user menu are unchanged from the branch this builds on, which already matched `user_context_menu.cpp`.
- **Toasts, live regions, contrast** have no desktop counterpart (Qt message boxes and a native palette), so they follow WCAG: 2.2.1 for the pause and the persistence, 1.4.3 for text contrast, 1.4.11 for the control borders, 3.1.1 for `lang`, 2.4.2 for the title.
- The audit sketched *`status` for info, `alert` for errors* per toast. I used `aria-live` on the two persistent containers instead: a `role=status`/`role=alert` that is always in the DOM reads as an app-wide live region (and made every `getByRole('alert')` query in the suite ambiguous), while the regions carry the same polite/assertive split. Same mapping, announced from a region that was mounted long before the text arrived.

## Testing

All from the repo root on tip `fd17dd8` (after the rv14 fixes), Servatrice 3.0.0 (the default image), Vitest at `--maxWorkers=2`.

- `git submodule update --init && npm ci` — clean. The only lockfile change on this branch is `@testing-library/user-event@^14.6.7` as a dev dependency of `@cockatrice/webatrice`, for the keyboard specs.
- `npx turbo run typecheck --concurrency=1` — 5/5 tasks passed (includes `tsc -p e2e`).
- `npm run lint` — 3/3 packages, 0 problems. Each rv14 commit's changed files were also linted on that commit's own tree.
- `npm test -- -- --maxWorkers=2` — sockatrice **880 passed**, datatrice **1281 passed**, webatrice **2321 passed, 2 skipped** (2323; +18 since rv13; the 2 skips predate this PR).
- `npm run test:integration -- -- --maxWorkers=2` — sockatrice **171**, datatrice **140**, webatrice **210 passed, 2 skipped** (212).
- Failing-first: every rv14 behaviour spec was run against its commit's parent sources and failed there (`Menu` placement ×2, point flip ×3 incl. right-click position, Space type-ahead, submenu close ×3, type-ahead reset ×2, `useDialogFocus` tabindex, `Toast` focused fold). `menu-placement.spec.ts` fails against `9681c1f`'s `Menu` (chromium: right-click at bottom-right covers its anchor).
- `npm run test:e2e -w @cockatrice/webatrice`: three-browser matrix in the pre-pulled `mcr.microsoft.com/playwright:v1.60.0-noble` image (this host's browser build does not match the pinned Playwright). Result: **57 passed, 6 failed, 6 skipped** (69; +3 for the new `menu-placement.spec.ts`). The 6 failures are the same two tests as in the rv13 run, both failing on the base branch too:
  - `replays.spec.ts` ("a finished game can be found, managed and watched") on all three browsers, at the same locator (`Local replays` › `replay_*.cor`).
  - `staff-tools.spec.ts:38` on all three with `spawnSync docker ENOENT` at its first `runSql`; the Playwright container has no docker CLI.
  - **`menu-placement.spec.ts`: 3/3**, **`keyboard-moderation.spec.ts`: 3/3**, **`browser-support.spec.ts`: 9/9.**
- `npm run test:e2e -w @cockatrice/sockatrice` was **not run**: no command shape, response handling or server flow changed.

## Notes for reviewers

- **Where to look first:** `hooks/useDialogFocus.ts` and `components/Menu/Menu.tsx` are the two new primitives; everything else is a caller. The menu's `menuItems()` deliberately scopes to the nearest `role=menu` so a portalled submenu and the slot entries do not pollute the parent level's roving focus.
- **The `handedOver` module-level variable** in `useDialogFocus` is the one piece of state outside React. It carries an opener between a dialog unmounting and its replacement mounting in the *same* commit, and is cleared in a microtask, so it can never reach an unrelated dialog. A ref could not do this: the two dialogs are different components. The unit spec covers the swap, and the e2e covers it end to end.
- **Toast queries.** The pill no longer carries a role of its own, so specs that identified a toast by `role=alert` now use `data-testid="toast"` or the Notifications region. If you prefer per-toast roles, see the §Desktop reference note on why the regions carry them instead.
- **`text-on-accent` is a token, not a hard-coded colour**, because the two palettes need opposite answers: the dark palette's accent is *light* (`#9F7AEA`), so it takes dark text. Reviewers checking a primary button in dark mode will see near-black text on purple; that is deliberate and is what the 5.74:1 figure is.
- **`border-control` vs `border-strong`.** I added a token rather than raising `border-strong`, which is also the scrollbar and card-database colour where 3:1 is not required; form controls are the surface 1.4.11 applies to. `palettes.spec` pins both.
- **Deliberately left for later PRs:** focus on route change (P18's third item, needs PR B's landmarks), the `CardImportForm.css` colours (P15 batch), the `FilterGamesDialog` string extraction (PR D), and every `features/game` row (PR C, which consumes this `Menu` and `DialogShell`).

## Review response (rv13)

Each fix is its own commit on top of `9e966a8`; no history was rewritten.

| finding | what changed |
|---|---|
| major: `autoFocus` dialog never gets its opener back | `useDialogFocus` records the opener from the `relatedTarget` of the first focus event into the dialog, which fires for React's layout-phase `autoFocus`. Render-time capture (the review's suggestion) would have recorded the *menu item* when a menu item opens the dialog in the same commit, so `Menu` also moved its focus return to a layout-effect cleanup. Specs: a dialog with an `autoFocus` field returns focus to its opener; a menu item that opens a `DialogShell` with an `autoFocus` field returns focus to the menu trigger. (`a06efe4`, `ef177d5`) |
| major: report-notice toast auto-dismisses | `persistent: true`; spec advances 60 s. (`9429948`) |
| major: no fallback for an unmounted opener | `returnFocusTo(opener)` option / `DialogShell` prop / `DialogReturnFocusContext`, recorded at open; default `closestLandmark` (nearest landmark, else `<main>`); moderation, user-games and report-user dialogs use `closestList` (the user list or chat log). Specs in the hook and `DialogShell`. (`a06efe4`) |
| major: red intermediate commits | Not folded here (cloud sessions cannot `rebase -i`); see "deferred to restack" below. |
| minor: `36cd584` mixes `fix` and `test` | Deferred to restack (split). |
| minor: Escape/Tab stop after the focused control unmounts | Top-most dialog re-homes focus on `focusout` to nothing and on DOM changes inside it (browsers differ on firing `focusout` for a removed element). Spec. (`e690b3c`) |
| minor: `TABBABLE` too broad | `:not([tabindex="-1"])` on every clause, rendered check (`display`/`visibility` up to the dialog; `getClientRects` is empty under jsdom, so computed style instead), one stop per radio group. No new dependency. Spec. (`e690b3c`) |
| minor: hover takes focus / closes instantly | Open delay 200 ms without focus, close delay 300 ms cancelled inside the submenu, focus follows the pointer. Specs. (`ef177d5`) |
| minor: disabled items unreachable | `aria-disabled`, guarded `onSelect`, `disabledReason` → `aria-describedby`. Specs in `Menu`, `UserDisplay`, `UserGamesProvider`. (`ef177d5`) |
| minor: contrast row not fully closed | Report comment input, report-queue filters and shortcut search → `border-border-control`. DebugLog textarea stays (read-only). (`8af8f4e`) |
| minor: `document.title` literals | Left to PR 28, which derives tab titles from keys at render time; P18 above now says so. |
| minor: persistent toasts unbounded | Newest 3 plus "+N more" (expands / "Show fewer"). Spec. (`5e81593`, `08393d9`) |
| minor: e2e not key-only | `name.focus()` once at the start, no `reasons.focus()`; Tab to OK from wherever Shift+Tab ended. (`ddbdc17`) |
| minor: no keyboard spec through the real `ModerationMenuItems` | Integration case: Shift+F10 → arrows → "Ban from server" → Enter → `BanFromServer` asserted. (`41820f2`) |
| nit: hard-coded error ids | `useId`. (`b0001d6`) |
| nit: `InputField` replaces `aria-describedby` | Joined. Spec. (`3e15318`) |
| nit: "flips" comment | The point form now says it slides; the rect form really flips. (`ef177d5`) |
| nit: Dismiss read with every toast | **Accepted and noted, not changed.** A text-only mirror in the live region would duplicate every toast's text in the DOM (every `getByText` on a toast in the suite becomes ambiguous) and needs the text extracted from arbitrary `ReactNode` children; the cost is one extra word per announcement. Worth revisiting with PR B's live-region pass. |
| nit: modifiers on Shift+F10 | Rejected unless only Shift. Spec. (`ef177d5`) |
| nit (PR text): 2.52–2.77 | Now 2.32–2.77. |
| PR 30 gaps 1–7 | All in `Menu` (`ef177d5`), each with a spec: rect anchor with flip-then-clamp (point form kept); submenu flip; hover/focus as above; `aria-disabled` + `disabledReason`; `shortcut` / `keyShortcuts` split, on `MenuCheckboxItem` too; `MenuRadioItem` (+ `MenuGroup`); `closeOnSelect` (default true for `MenuItem`, false for checkbox/radio) via `MenuLevelContext`; 500 ms type-ahead buffer. Existing callers are unchanged and pass; the ones that still call their own `onClose()` after `onSelect` are harmless double closes and can drop it when PR 30 touches them. |

## Review response (rv14)

Each fix is its own commit on top of `9681c1f` (parent still `13351fd`); no history was rewritten. Every behaviour spec below was run against its commit's parent sources and failed there.

| finding | what changed |
|---|---|
| major: bottom-edge placement measured under its own cap | The first pass renders at 0,0 with no `maxHeight` (`style={position ?? { left: 0, top: 0 }}`); the layout effect measures the natural size, then places and caps, all before paint. Not `visibility: hidden`: the autoFocus layout effect focuses the first item in that same commit, and browsers refuse focus on a hidden element. Re-anchoring repeats the measurement (placement is keyed by the anchor). The `Menu` spec's layout mock now honours `style.maxHeight`; new cases: Shift+F10 on a control at y 700–720 opens at top 398, a point at y 700 opens above. (`159c85d`) Browser coverage: `e2e/specs/menu-placement.spec.ts` pins a user name to each of the 8 edges and corners and opens its menu by right-click and Shift+F10, asserting fully in view and not covering the anchor wherever the other side has room; it fails against `9681c1f` (right-click at bottom-right covers its anchor) and passes on chromium, firefox and webkit. (`0aea485`) |
| major: Space during type-ahead activates the item | While the buffer is live, Space is appended and `preventDefault`ed; otherwise it still activates. Specs: `user.keyboard('move c')` lands on "Move card" with nothing run; a lone Space still runs the focused item. (`732ecc4`) |
| minor: arrows leave a hover-opened submenu open | ↓/↑/Home/End close it unless they land on its own entry. Specs for ↓, ↑, End, and Home landing on the entry. (`c5c9ccc`) |
| minor: point anchors only slide | A point is a zero-size rect: below-right, flipping above/left where that has room, then clamp (`align: 'end'` flips the other way). `useContextMenu` now anchors at the exact pointer position, as desktop's `popup(event->globalPos())`; the old +2/+4 nudge would have put a flipped menu back over the cursor. `placeMenu` and `useUserDisplay` specs updated. (`0f97b66`) |
| minor: `shortcut`/`keyShortcuts` hand-synced | `useMenuShortcut()` → `menuShortcut(actionId) → { shortcut, keyShortcuts }` in `feature-widgets/shortcuts/menuShortcut.ts`, reading the shortcuts slice's overrides over the defaults; `keyShortcuts` lists every binding in `aria-keyshortcuts` syntax (`KeyD` → `D`, `NumpadAdd` → `Plus`, …). There are no production `Menu` entries with shortcuts yet; the existing call site, `useShortcutHints` (MUI card menu), now formats through `toMenuShortcut`. Documented on `MenuEntryProps.shortcut` and in the Summary for PR 30. Spec covers defaults, rebinding, punctuation/numpad and Mac display. (`dc879f4`) |
| minor: hygiene in `5e81593` / `ef177d5` / `08393d9` | Added to the restack list below. |
| nit: `focusFallback` tabindex sticks | Removed on that element's next `blur` (one-shot listener). Spec extends the landmark-fallback case. (`071889f`) |
| nit: type-ahead survives navigation | Reset on ↓/↑/Home/End and when the pointer moves focus. Specs. (`905fd3e`) |
| nit: Menu API rough edges | `MenuGroupProps` exported; `MenuSubmenuProps.label` documents why it is a prop (it is also the submenu's accessible name, `children` holds the entries); `placeMenu` and the three timing constants are no longer in the barrel (the spec imports `./Menu`). (`7029850`) |
| nit: focused toast folded away | `Toast` reports focus in/out (`onFocusChange`); the provider never folds the toast holding focus, which folds once focus leaves. Spec. (`da5ba7a`) |

No commit in this round adds or changes an i18n key, so `src/i18n-default.json` is unchanged at each (the pre-commit `translate` hook ran on every commit and produced no diff). Every new commit was linted on its own tree.

### Deferred to restack

- Fold `0a0ab4d` (the PrivateChat Send spec follow-up) into `f6ac60e`, so `test:integration` is green at every commit.
- Fold `542cf5d`'s spec fix (`browser-support.spec.ts` looks in the Notifications region) into `f6ac60e`, so e2e is green at every commit.
- Split `36cd584` into `fix(a11y): hand the opener across swapped dialogs` (hook + unit spec) and `test(a11y): keyboard-only moderator action e2e`.
- Split `08393d9`: fold its `ToastContext` hunk (the lint-only class-string wrap) into `5e81593`, which it makes lint-clean, and its `src/i18n-default.json` hunk into `ef177d5`, which added those three keys.
