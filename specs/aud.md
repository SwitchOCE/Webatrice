# aud — Accessibility (LONG-017) + i18n (LONG-016) audit

Findings only; no code. Audited trees:

- **Platform:** `origin/claude/restack-21-appearance-i18n-diag` @ `c408cce`
- **Game:** `origin/parity/05-refactor-seat` @ `dc7ce0b`, `origin/parity/17b-game-menus` @ `5a8feae`, `origin/parity/23d-deck-share` @ `23c850e` (siblings off `e477701`; none contains another)
- Desktop reference: Cockatrice `add65caa` (`cockatrice/src/client/settings/shortcuts_settings.h`)

Paths are relative to `packages/webatrice/src` unless prefixed. Every table row was confirmed by reading the cited lines. A static read cannot confirm runtime screen-reader behaviour, so those rows are marked *unverified*. Repeated patterns are grouped into one row.

## TL;DR

1. **Keyboard blockers (P1).** You cannot join a game without a mouse (`GamesList` rows, P1). Main nav tabs are unreachable (P3). User actions, including all moderator actions, open only by right-click (P5). On `/game/*`, **Tab is swallowed by the next-phase shortcut**, even inside dialogs (G1), and no card, pile or player menu can take focus (G2/G4/G5).
2. **Desktop parity bug found in passing.** Desktop `Shift+Tab` is *Next Phase Action*; Webatrice binds it to *previous phase* (G1).
3. **Focus management.** `DialogShell` and its four copies, plus the deck `DeckDialogFrame`, have no initial focus, no trap and no restore (P4, G14, D1). One fix in the shell covers about 25 dialogs.
4. **Live regions.** Room chat, private chat and the game log have no `role=log`. Toasts announce unreliably and auto-dismiss actionable content (P9, P11, G11).
5. **Contrast.** White on the dark-palette accent is **3.26:1**, which fails on every primary button. Form-control borders are about 1.2–1.4:1 (non-text needs 3:1). `text-red-400` errors fail in light mode (2.5–2.8:1).
6. **i18n.** Platform is mostly done, apart from rooms and about 25 TopBar literals. The game tree has about 670 literals and decks about 230. There is one live missing-key bug (`Login.toasts.passwordResetSuccess`). **No CI check exists**; §2.5 proposes one.
7. The matrix evidence is stale in two places. `useLeftNav.ts` no longer exists, and `Game.dragdrop.spec.tsx` is no longer skipped: its keyboard suite was deleted, so keyboard drag has **zero** coverage.

## 1. LONG-017 — accessibility

### 1.1 Platform surfaces (`claude/restack-21-appearance-i18n-diag`)

Scope: ~134 non-spec `.tsx` files + theme CSS, excluding `features/game` and `features/decks`. Every row was confirmed by reading the cited lines; anything not runtime-checked is marked *unverified*.

**Existing patterns to copy**

| pattern | where | provides |
|---|---|---|
| `useGridRows` | `hooks/useGridRows.ts`; used by `replays/LocalReplays.tsx:113`, `replays/ServerReplays.tsx:112` (treegrid), `card-art-rules/CardArtRules.tsx:139`, `reports/components/ReportTable.tsx:107` (+ `<button>` sort headers with `aria-sort`), `feature-widgets/user-games/UserGamesDialog.tsx:116` | roving tabIndex, ↑/↓/Home/End move selection+focus, Space select, Enter activate, ←/→ tree collapse; caller supplies `role=grid/treegrid` + `aria-selected` |
| Settings tablist | `features/settings/Settings.tsx:71-110`, `SettingRow.tsx` | `<button role=tab>` roving tabIndex + `aria-controls` + `tabpanel`; native switch/range/color/select inputs with `<label htmlFor>`, `aria-describedby`, `<output>` |
| MUI dialogs | `dialogs/{Alert,Confirm,Prompt}Dialog`, `administration/ShutdownDialog.tsx`, `moderation/TemporaryPasswordDialog.tsx`, `replays/ReplayShareCodeDialog.tsx`, `rooms/dialogs/CreateGameDialog` | trap, restore, title labelling, `autoFocus` primary |
| `CheckboxField` | `components/CheckboxField/CheckboxField.tsx` | `sr-only` native input + focus-visible ring |
| status regions | `Developer.tsx:83`, `ReportQueue.tsx:117`, `MyReports.tsx:25`; `MessageMacrosEditor.tsx:124-136` (`aria-invalid` + alert) | — |
| contrast test | `services/theme/palettes.spec.ts` | text-token contrast is already under test (extend it to the pairs below) |

`DialogShell` (`dialogs/DialogShell/DialogShell.tsx`) gives `role=dialog aria-modal aria-label`, Escape/backdrop close and a labelled Close — but **no focus management** (row P4). `UserActionsMenu` is the only shared menu primitive and it is mouse-only (row P5).

| # | surface | file | problem | fix | effort |
|---|---|---|---|---|---|
| P1 | Room games list | `features/rooms/components/GamesList.tsx:106-112` | rows are `<div role=row>` with only `onClick`/`onDoubleClick` — no tabIndex/keys/`aria-selected`. **A keyboard user cannot select, so cannot join/spectate a game.** `role=gridcell` inside `role=table` is invalid. | `role=grid` + `useGridRows` (`onSelect=handleSelect`, `onActivate=handleActivate`), `aria-selected`; virtualized, so `onSelect` must `scrollToRow` via the react-window list ref | M |
| P2 | Games list sort headers | `GamesList.tsx:174-193` | `<div role=columnheader onClick>` not focusable | `<button>` inside header + `aria-sort` (as ReportTable) | S |
| P3 | Main nav tabs (room/game/replay/deck) | `feature-wrappers/layout/TopBar.tsx:444-493` | `<div role=tab onClick>` — no tabIndex/keys; middle-click close only; `<button>` nested in `role=tab`; close named by `title` only; no tabpanel | they are route nav, not ARIA tabs: `<nav aria-label>` + `<NavLink aria-current=page>` + sibling close `<button aria-label="Close {title}">` | M |
| P4 | All DialogShell dialogs (~17: ChangePassword, ChangeAvatar, EditUser, Registration, RequestPasswordReset, ResetPassword, AccountActivation, Ban/Warn/AdminNotes/History, UserGames, KnownHost, DebugLog, ReportUser) | `dialogs/DialogShell/DialogShell.tsx:38-101` | no initial focus (only AdminNotes/Warn `autoFocus`), no trap (Tab escapes behind `aria-modal`), no restore; `aria-label` not `aria-labelledby`; Escape is a global `window` listener (stacking *unverified*) | fix once in the shell: remember `activeElement`, focus first focusable/`[data-autofocus]`, trap (or `inert` siblings), restore on unmount, `aria-labelledby` via `useId()` | M |
| P5 | User context menu (chat, buddy, ignore, report, **all moderator actions**, **view user's games**) | `components/UserDisplay/{UserDisplay.tsx:33,useUserDisplay.ts:25,UserActionsMenu.tsx}`, `components/Message/Message.tsx:83` | opens only via `onContextMenu` on a `<div>` *inside* the focusable `<a>`, so Shift+F10/Menu key never reaches it; no focus-in, no arrow keys, no focus return; separators plain `<div>`. "View user's games" reachable only here | handler on the `NavLink` + open on `Shift+F10`/`ContextMenu` key (anchor from `getBoundingClientRect`); extract a shared `Menu` primitive: focus first item, ↑/↓/Home/End, Tab closes, restore focus, `role=separator`. Add a "Games" action on the Player page | M |
| P6 | TopBar user menu | `TopBar.tsx:518-640` | trigger lacks `aria-haspopup`/`aria-expanded`; panel no `role=menu`, **no Escape**, no focus move/restore | reuse the P5 primitive | S |
| P7 | Known-hosts picker (login) | `feature-widgets/known-hosts/KnownHosts.tsx:178-230,305-330` | saved-host rows are `<div onClick>` (can't switch server by keyboard); Edit button `opacity-0 group-hover:opacity-100` (invisible on focus); toggles lack `aria-expanded`; connection test result is icon+colour only | `role=listbox` of `<button role=option>`; `focus-visible:opacity-100`; `aria-expanded`; `sr-only` text + `role=status` | M |
| P8 | Hand-rolled dialogs | `rooms/dialogs/FilterGamesDialog/FilterGamesDialog.tsx:107-135`, `feature-widgets/shortcuts/SettingsTab/SequenceEdit.tsx:48-58` | same as P4; SequenceEdit `role=dialog` has **no name**, focus never moved in, recording hint not announced | move onto DialogShell after P4; `aria-labelledby` h2, `aria-describedby` hint | S |
| P9 | Room + private chat | `rooms/components/RoomChat.tsx:98-124`, `player/PrivateChat.tsx:89-125`, `rooms/components/Messages.tsx` | no `role=log`/`aria-live` — incoming messages silent; private chat sender conveyed only by alignment/colour | `role=log aria-live=polite aria-label tabIndex=0` on scroller; `sr-only` "{sender}: " prefix | S |
| P10 | Chat inputs | `RoomChat.tsx:132`, `PrivateChat.tsx:138` | placeholder is the only label | `aria-label` / hidden `<label>` | S |
| P11 | Toasts | `components/Toast/Toast.tsx:91-112`, `ToastContext.tsx:98-112` | each toast mounts its own `role=alert` with content already present (unreliable) and also `aria-live=polite` (conflict); actionable toasts (PM → chat, `NotificationToast`) auto-close after 10 s with no pause (WCAG 2.2.1) | persistent `role=region aria-label=Notifications aria-live=polite` container; `status` for info, `alert` for errors; pause on hover/focusin; actionable toasts persist until dismissed | S |
| P12 | Conditionally-mounted live regions | `DebugLogDialog.tsx:93`, `PrivateChat.tsx:130`, `UserGamesDialog.tsx:108` | region inserted together with its text | keep region mounted, swap text | S |
| P13 | Card callouts in chat | `components/Message/CardCallout.tsx:20-23` | preview on `onMouseEnter` only; span not focusable | `<button type=button>`, open on focus, close on blur/Escape | S |
| P14 | Form errors not tied to fields | `dialogs/ReportUserDialog/ReportUserDialog.tsx:163,214`; `components/InputField/InputField.tsx:44-69` (Login/Register/Reset) | plain `<span>` errors / error inside `<label>`; no `aria-invalid`, no announcement | `aria-invalid`, `aria-describedby={errId}` (`useId`), `role=alert` | S |
| P15 | Misc names/semantics | `CardImportDialog.tsx:22` (only unlabelled IconButton in scope); `CountryDropdown.tsx:50` (`<img>` no alt); `Login.tsx:67,129-141`, `Initialize.tsx:42` (decorative `alt='Stock Player'`/`"logo"`); `UserDisplay.tsx:34`, `Player.tsx:142-146` (flag alt = raw code); `CardImportForm.tsx:148-165` (`role=button` div wraps a `<Button>`); `CardRelatedLinks.tsx:244-254` (no `aria-expanded`); `Player.tsx:170`, `CreateGameDialog.tsx:150-160`, `ReportTable.tsx:107` (unlabelled groups/grid); `ShortcutsRow.tsx:29-75` (conflict only in `title`; every Edit/Reset has the same name) | `aria-label`/`alt=""`/translated country; drop nested role; `aria-expanded`; `role=group aria-labelledby`; `sr-only` conflict + `aria-label="Edit {action}"` | S |
| P16 | Connection indicator | `TopBar.tsx:354-371` | `aria-label` on a lucide SVG without `role=img`; transitions to Disconnected/Not responding unannounced | `<span role=status>` + `sr-only` text | S |
| P17 | Virtual lists | `components/VirtualList/VirtualList.tsx:19-21` | `RowsRow` drops react-window v2's per-row `ariaAttributes` (*unverified* API), so `UserRows` is a `role=list` with no listitems | spread `ariaAttributes` onto the row unless caller sets a role | S |
| P18 | Page-level | `index.html:2`, `i18n.ts`, Layout | `<html lang="en">` never follows UI language (3.1.1); no per-route `document.title` (2.4.2); no focus move on route change | `i18n.on('languageChanged')` → `documentElement.lang` (BCP-47 via `toBcp47`); title + focus `<h1>`/`main` in Layout | S |
| P19 | Dead legacy table | `rooms/components/GameSelector/*`, `OpenGames.tsx:106` | `TableRow onClick/onDoubleClick`; imported only by specs | delete | S |

**Contrast (WCAG 2.x, from `styles/tokens.css` = `services/theme/palettes.ts`; alpha blended onto `bg-surface`).** Text tokens (`text-primary/secondary/muted`, status, `text-accent`) all pass ≥4.5 in both palettes (lowest: dark `text-muted` on `bg-elevated` 4.54); selected-row text on `accent/20` ≥7.1; chat bg with muted text 5.3/5.9. Failures:

| pair | used by | dark | light | needs |
|---|---|---|---|---|
| `#FFF` on `bg-accent` (dark `#9F7AEA`) | every primary button (GamesList, RoomChat, PrivateChat, RoomsList, LoginForm, FilterGamesDialog, SequenceEdit, KnownHostForm, ReportUserDialog, ReportThread, ErrorFallback, `moderationStyles BUTTON_PRIMARY_CLASS`) + all MUI `contained` (`styles/mui-overrides.css:93-95`) | **3.26** | 6.42 | 4.5 |
| `#FFF` on `accent-hover` (dark `#B794F4`) | hover of the above | **2.45** | 8.40 | 4.5 |
| `text-red-400` `#F87171` on surface/base | `moderationStyles ERROR_CLASS`, `ReportUserDialog.tsx:163,214,235`, `ReportQueue.tsx:143`, `MyReports.tsx:50` | 6.16 | **2.77/2.52** | 4.5 → use `text-danger` |
| `border-subtle` vs field fill/surface (1.4.11) | `InputField.tsx:66`, `FIELD_CLASS`, report/chat inputs, `.settings-input`, MUI OutlinedInput (`mui-overrides.css:123`) | **1.24/1.40** | **1.21/1.44** | 3.0 |
| field fill `bg-elevated` vs `bg-surface` | same | 1.13 | 1.19 | 3.0 (one of border/fill must reach it) |
| unchecked checkbox `border-strong` | `CheckboxField.tsx:56`, `FilterGamesDialog.tsx:437`, MUI Checkbox/Radio (`mui-overrides.css:150-153`) | **1.98/2.24** | **1.89/2.26** | 3.0 |
| tab close icon `text-muted`@60% on inactive tab | `TopBar.tsx:482` | **2.64** | **2.52** | 3.0 |
| inherited `text-primary` on hard-coded `#FAFAFA` dropzone | `CardImportForm.css:31-37` | **1.08** (render *unverified*) | 16.6 | 4.5 → tokens |
| `color: red` on dark paper | `CardImportForm.css:20` | **4.26** | — | 4.5 |
| server MOTD inline colours | `server/Server.tsx:84-92` | *unverified* (server-supplied) | | |

Fix sketch: dark-palette primary buttons get dark text (`#14101F` on `#9F7AEA` = 5.74) or paint with `accent-secondary` `#6B46C1` (white 6.42), and make `accent-hover` darker not lighter; raise `border-subtle`/`border-strong` for form controls to ≥3:1 (target values to be computed in the PR); `text-red-400` → `text-danger`; tab-close full opacity; extend `palettes.spec.ts` to assert these UI-component pairs (≥3) and on-accent text (≥4.5).

### 1.2 Game board, game menus, decks (`parity/05-refactor-seat`, `parity/17b-game-menus`, `parity/23d-deck-share`)

Seat (cards, zones, piles, life) audited on **05** (it deletes `PlayerBox.tsx` for `components/ui/PlayerBoard/*`; 17b spots grepped, not read whole). Menus, shortcuts, phase bar, chat, dialogs on **17b**. Decks on **23d**. Paths under `packages/webatrice/src/features/game` unless prefixed.

**Bottom line:** the board is not usable without a pointer. No card or pile is focusable; every *live* card/pile/player menu is a custom popup without menu semantics; seat drags start only on pointer down, so the registered `KeyboardSensor` is inert; and the shortcut layer swallows **Tab** on `/game/*` (G1). Decks (23d) are in much better shape.

**Shared building blocks / good patterns**

- `hooks/useGridRows.ts` is **not in any game branch** — only on restack-21. It is the target for a roving hand/battlefield/deck-list once the trees join.
- **Two menu primitives; the accessible one is dead.** The MUI-based `context-menus/{Card,Zone,Hand,Player}ContextMenu` (roles, arrow keys, focus) are mounted in `Game.tsx:267-273`, but `Game.tsx:290` notes `openPlayerMenu has no caller` (other three openers *unverified*). The live seat uses the custom `ContextMenu` (17b `components/PlayerBox/ContextMenu.tsx`; 05 `context-menus/ContextMenu/ContextMenu.tsx`) and `CardMenuPopup` (05 `CardContextMenu.tsx:206-330`).
- Shortcuts: `feature-widgets/shortcuts/ShortcutProvider.tsx` (one window listener, route-scoped, skips text inputs) dispatches ~90 desktop-default game actions (`defaults.ts`, `hooks/useGameShortcuts.ts`, `SeatShortcutsContext.tsx:15-62`). Nearly all act on the **current selection**, and the only keyboard way to select is Ctrl+A (battlefield).
- Models to copy: `dialogs/IncomingRevealDialog/IncomingRevealDialog.tsx:701-712` (card = `role=button`, `tabIndex 0`, name `aria-label`, `aria-pressed`, Enter/Space); `TallyOverlay.tsx:29,44-46` (`role=status`, count `aria-live=off`); `SidebarResizer.tsx:100-111` (`role=separator` + `aria-value*` + arrows); `PhaseTrack.tsx:161-164` (`<nav aria-label>` of real buttons); `ChatLog.tsx:225-241` input + `chat.focus` shortcut; unused 05 `ui/CardSlot/CardSlot.tsx:72-89` (tabIndex, `onFocus`→`useGameSelection.onCardFocus`, dnd `attributes/listeners`) — the blueprint to revive.
- Decks (23d): `ShareDeckDialog.tsx:61-66,112-113`, `DeckShareLinksDialog.tsx:31-36,84` (`alertdialog`, focus to confirm), `DeckRow`/`DeckFolderRow` (per-deck names, `aria-pressed`, `focus:opacity-100`), `DeckFolderBar.tsx:26-45` (breadcrumb `aria-current`), `CardSearchFilters` chips, `DeckRowActionsMenu.tsx:114-123` (roles + `aria-haspopup/expanded`).
- **Skipped spec:** `Game.dragdrop.spec.tsx` has **no** skip on any of the three branches. `origin/master` has `describe.skip('Game drag-drop (keyboard sensor)')` (line 14), skipped because its testids (`player-board-1`, `card-slot`, zone-stack anchors) no longer render. a1a5b3c (ancestor of all three) replaced it with pointer-only cross-seat tests, so **keyboard drag has zero coverage** — the matrix's evidence text is stale.

| # | surface | file (branch) | problem | fix | effort |
|---|---|---|---|---|---|
| G1 | **Shortcuts: Tab / Shift+Tab** | `feature-widgets/shortcuts/defaults.ts:20-21`; `ShortcutProvider.tsx:96-104` (17b) | `game.nextPhase`=`Tab`, `game.prevPhase`=`Shift+Tab`, matched on `window`, `preventDefault` before the handler: **Tab never moves focus on `/game/*`** outside text fields — including inside open dialogs/menus, where Tab on a button advances the phase. Desktop does bind `aNextPhase` = `Ctrl+Space;Tab` (`shortcuts_settings.h:494`), but in Qt dialogs are separate windows. **Parity bug too:** desktop `Shift+Tab` is `aNextPhaseAction` (Next Phase Action), not previous phase. | keep Tab (parity) but only when focus is on `body`/the board, never inside `[role=dialog]`, `[role=menu]`, `[aria-modal]` or on a form control/button — a sanctioned accessibility divergence (`webatrice.instructions.md` §parity, item 3). Add a provider-level "modal open → only GLOBAL + Escape" guard. Remap Shift+Tab to next-phase-action | S |
| G2 | Cards (hand, battlefield, stack, zone view) | 05: `battlefield/Battlefield/Battlefield.tsx:317-395`, `ui/HandZone/HandZone.tsx:235-254`, `ui/StackColumn/StackColumn.tsx:96-110`, `dialogs/ZoneViewDialog/ZoneViewPanel.tsx:877-895`; 17b PlayerBox ~4770/4995/5045/5355 | plain `<div data-card>` with pointer/contextmenu/dblclick only — no tabIndex/role/keys. Tap, play, select, menu, preview all mouse-only. Selected = styling only; tapped = 90° rotation only; hand expands on hover only | IncomingRevealDialog/CardSlot props: `role=option` (in a labelled `listbox`/`grid`) or `button`, roving tabIndex via `useGridRows`, `aria-label` = name + state (tapped, face-down, P/T, counters), `aria-selected`; Enter = play/tap, Space = select, Shift+F10/Menu = menu, `onFocus`→`onCardFocus` (preview) | L |
| G3 | Drag & drop | 17b `hooks/useGame.ts:67-70`; 05 `components/ui/SeatDragContext.tsx:80-101` | `KeyboardSensor` registered but drags start only from `listeners.onPointerDown`; no `attributes`/`onKeyDown` on cards → keyboard drag can never start; no test | primary keyboard path = "Move to…" menu + existing move shortcuts (desktop has no keyboard drag either); optionally wire dnd-kit keyboard listeners with zone coordinates. Restore a keyboard-path spec either way | L |
| G4 | **Live context menus** (card, pile, hand, player list) | 05 `context-menus/ContextMenu/ContextMenu.tsx:60-235`, `CardContextMenu.tsx:206-330`; 17b `PlayerBox/ContextMenu.tsx`, `PlayerListContextMenu.tsx` | no `role=menu/menuitem`, no focus-in, no arrows/type-ahead, **submenus open on hover only**, Escape/outside click don't return focus, ✓ is `aria-hidden` with no `aria-checked`, shortcut hints not `aria-keyshortcuts` | one shared primitive (shared with platform P5): MUI `Menu` + existing `NestedMenuItem`, or add roles, focus-first, roving arrows, →/← submenus, `menuitemcheckbox` + `aria-checked`, focus return. Then delete whichever of the two game menu stacks loses | M |
| G5 | Piles (library, graveyard, exile) | 05 `ui/ZoneStack/ZoneStack.tsx:75-93,154-169,980-1050`; 17b PlayerBox 4635-4698 | divs with `title` only; menu on right-click only; F3/F4 view library/graveyard but no exile view shortcut found | `<button aria-label="Graveyard, 12 cards, top: X" aria-haspopup=menu>`; Enter/Menu key opens the menu | M |
| G6 | Card visuals | 05 `ui/SeatCard/SeatCard.tsx:98-108,183-227` | name is a pill + `title`; counter type conveyed by colour only; middle-click zoom mouse-only | `aria-label` per counter, summarised in the card label; keyboard zoom on focused card | M |
| G7 | Selection by keyboard | `defaults.ts:127-134` (17b) | only Ctrl+A/row/column on battlefield; hand/stack cards can't be selected so selection shortcuts don't apply there | falls out of G2: Space toggles, Shift+arrows extend | M (with G2) |
| G8 | Life total | 05 `right-sidebar/PlayerInfoPanel/PlayerInfoPanel.tsx:139-156`; 17b PlayerBox 3835-3851 | `role=button` with tab stop but **no `onKeyDown`**; `aria-label` replaces content so the **number is never announced**; only local seat has the role | Enter = +1 / Shift+Enter = −1 (or `role=spinbutton` with ↑/↓); label "Alice, life 20"; announce changes via the game log region (G11) | S |
| G9 | Mana pool pips | 05 `PlayerInfoPanel.tsx:38-55`; 17b PlayerBox 934-950 | `role=button`, no tabIndex/keys; decrement right-click only | real +/− buttons or spinbutton | S |
| G10 | Arrows / attach | 05 `ui/PlayerBoard/useSeatShortcutOperations.ts:181-197,290-305`, `usePendingArrows.ts:161-180`; `useGameArrowInteractions.ts:128-146` | Alt+A / Ctrl+Alt+A start pending arrow/attach, but target only by click/mouse-follow; pending mode unannounced; arrows only in SVG overlay | keyboard target picker (arrows/Tab among cards+players, Enter commits, Escape cancels); announce "Choose target for X" | M |
| G11 | Game log + chat | `components/ChatLog/ChatLog.tsx:128-135` (17b) | plain scroll div — no `role=log`/`aria-live`; draws, moves, life, opponent chat silent; no other live region in the game; input has both hidden label and `aria-label` | `role=log aria-live=polite aria-relevant=additions`; drop duplicate `aria-label` | S |
| G12 | Phase bar | `components/PhaseTrack/PhaseTrack.tsx:167-169,193-233` (17b) | expands on hover only, so collapsed phases are unlabelled stripes; active phase by opacity only; non-active player's buttons `disabled` (current phase unreadable) | `aria-current="step"`; expand on `:focus-within`; `aria-disabled` instead of `disabled` | S |
| G13 | Zone view panel | 05 `dialogs/ZoneViewDialog/ZoneViewPanel.tsx:671-790` | no `role=dialog`/name; close `title` only; search placeholder-only; no focus return | `role=dialog aria-labelledby`, labels, return focus to the pile | S |
| G14 | Custom modals | 17b `dialogs/DialogShell/DialogShell.tsx:37-60`, `PlayerListDialogs.tsx:37-58` (ModalShell), `MoveTopUntilDialog.tsx:54-72`, `GameInfoDialog.tsx:33-45` | three more copies of the DialogShell pattern, same missing trap/initial focus/restore | after platform P4, have all three use DialogShell | S |
| G15 | Player list | `right-sidebar/PlayerList/PlayerList.tsx:174-189` (17b) | `<li onContextMenu>` only — kick/info/investigate unreachable by keyboard | per-row "More actions for {name}" icon button opening the shared menu | S |
| G16 | Hand button | 05 `ui/HandZone/HandZone.tsx:115-145` | name from English `title`; keyboard activation synthesises contextmenu at (0,0) → menu opens at viewport corner | anchor to button rect when `e.detail === 0`; `aria-label`, `aria-haspopup` | S |
| G17 | Focus indicators | `features/game/Game.css:104-115` (05, 17b) | `:focus-visible` rules target BEM classes no live component renders; `ChatLog.tsx:244`, `ZoneViewPanel.tsx:784` use `focus:outline-none` + 1px border change | shared `focus-visible:ring-2 ring-accent` utility on game interactives; delete dead CSS | S |
| G18 | Board structure | `Game.tsx`, `GameBoardCell.tsx`, `PlayerBoard.tsx` (05/17b) | no landmarks/headings; seats and zones unlabelled | seat = `<section aria-label={player}>`; zones `role=group aria-label="Alice's battlefield, 7 cards"` | S |
| G19 | Orphaned accessible code | 05 `ui/CardSlot/*`, `useGameSelection.ts:27-48`; 17b `ui/HandZone`, `StackColumn`, `PlayerBoard` (unrendered) | 05 rewrites zones pointer-only, leaving the only keyboard card model unused | port CardSlot props into 05's PlayerBoard zones (G2) or delete the orphaned focus plumbing | M |
| D1 | Deck dialogs | 23d `features/decks/dialogs/DeckDialogFrame.tsx:9-17`, `useEscapeKey.ts` | frame has no trap/restore; **no `role=dialog`/name** on CardDetail (89), CreateDeck (46), ExportDeck, ImportDeck, PrintingPicker (labelled h2s not linked); DeleteDeckDialog bypasses the frame | move role/`aria-modal`/`aria-labelledby`/trap/restore into the frame (or build it on DialogShell) | M |
| D2 | Share dialog | 23d `dialogs/ShareDeckDialog.tsx:73-112` | on success the focused input unmounts → focus to `<body>`; "Copied" unannounced | focus link field/Copy on created state; `role=status` for copy result | S |
| D3 | Quick-add autocomplete | 23d `components/editor/QuickAddSearch.tsx:45-140`; `PlainCardList.tsx:26-38` | arrow/Enter/Escape logic but no combobox semantics; highlight visual only; input unnamed (placeholder only); results unannounced | ARIA 1.2 combobox (`role=combobox`, `aria-expanded/controls/activedescendant`, `listbox/option`), `aria-label`, polite "5 suggestions" | S |
| D4 | Deck row actions menu | 23d `components/editor/DeckRowActionsMenu.tsx:64-128` | roles present but no focus-in (portalled, Tab goes to next row), no arrows, no focus return; trigger `title="Card actions"` identical on every row | shared menu primitive; `aria-label="Actions for {card}"` | S |
| D5 | Hover-only affordances | 23d `PlainCardList.tsx:99` (+/−/remove `opacity-0 group-hover`); `search/AdvancedCardSearch.tsx:60-100` (preview + Add overlay hover-only; count/added feedback not live) | keyboard focus lands on invisible buttons | `group-focus-within:opacity-100`; `onFocus` preview; `role=status` on count | S |
| D6 | Deck editor shortcuts | 23d `feature-widgets/shortcuts/defaults.ts:190-194`, `features/decks/DeckEditor.tsx:78-79` | `deck.new/save/load/addCard(=)/removeCard(−)` listed in the Shortcuts tab but only undo/redo registered; desktop has keyboard add/remove on the selected row | register them; add/remove act on the focused row (with `useGridRows` on the deck list) | M |

*Unverified:* live openers of the MUI Zone/Hand/Card menus; whether arrows/attaches reach the game log; browser focus rings under Tailwind preflight where not overridden. No runtime or screen-reader testing was done.

## 2. LONG-016 — i18n

Method: TypeScript-AST scan of JSX text, label-like attributes/props (`title`, `aria-label`, `placeholder`, `label`, `helperText`, `alt`), `setError` messages and toast `children`, excluding `t()` args, `defaultValue`, logger/console, `throw`, specs, `__test-utils__`, `__mocks__`. Every hit was read to confirm. Raw hit counts: a21 227, g17 710, g23 335 (minus false positives below).

**Headline.** The a21 platform tree is mostly translated; the gaps are **rooms** and **TopBar**. The game tree is **almost entirely untranslated** (~670 literals in `features/game`; only `GameErrorBoundary`, `GameReplay`, `TallyOverlay` use `t`). `features/decks` (23d) is about half done (~230 literals). `g05` adds no game strings beyond 17b.

**Key convention.** One top-level namespace per component (`Reports.column.*`, `UserGamesDialog.column.players`, `SettingsStorage.cancel`); shared items under `Common.label.*` / `Common.validation.*`. "Cancel" exists 9× under different namespaces — proposal: add `Common.action.{cancel,close,create,send,apply,reset,join,dismiss}` for generic buttons and migrate as files are touched.

### 2.1 Platform tree (`claude/restack-21-appearance-i18n-diag`)

| file:line | string | proposed key |
|---|---|---|
| feature-wrappers/layout/TopBar.tsx:250,261,272 | `Lobby`, `Room ${roomId}`, `Game ${gameId}` (tab title fallbacks) | `TopBar.tab.lobby`, `TopBar.tab.room {id}`, `TopBar.tab.game {id}` |
| TopBar.tsx:638-642 (`STAFF_TABS`), 651, 665-681 (`detectTransientTab`) | Administration, Moderation, Card Art Rules, Developer, Report Queue, My Decks, Settings, Shortcuts, Account, Logs, My Reports | reuse existing `UserMenu.*` keys; add `TopBar.tab.myDecks` (`detectTransientTab` already receives `t`) |
| TopBar.tsx:659,714; features/decks/deckFolders.ts:146; deckTree.ts:47 | `Deck #${id}` | `TopBar.tab.deck {id}` |
| TopBar.tsx:367,369,370 | Disconnected / `Server not responding ({s}s)` / Connected | `TopBar.connection.{disconnected,stale,connected}` |
| TopBar.tsx:399,401,484,540,619 | View your decks, Decks, Close tab, Signed in, Sign out | `TopBar.{decks.title,decks.button,closeTab,user.signedIn,user.signOut}` |
| TopBar.tsx:567,583,584,587 | Snap grid, phase-track tooltips ×2, Toggle auto-hide phase tracker | `TopBar.game.{snapGrid,phaseTrackCollapse,phaseTrackPin,phaseTrackToggle}` |
| TopBar.tsx:353,375 | `Webatrice` (alt + brand) | brand: allowlist (or `TopBar.logoAlt`) |
| features/rooms/dialogs/CreateGameDialog/CreateGameDialog.tsx:109-275 (20) | Create Game, Description, Password, Max players, Starting life total, Game type, Permissions, Only buddies, Only registered users, Spectators…, Create as spectator/judge, Share decklists on load, Cancel, Create | `CreateGameDialog.{title,section.*,label.*}` + `Common.action.*` |
| features/rooms/dialogs/FilterGamesDialog/FilterGamesDialog.tsx:27-277 (25) | No limit, Filter games, Close, field labels, Hide …×7, Show …×4, Spectator filters, Reset/Cancel/Apply | `FilterGamesDialog.{title,noLimit,label.*,hide.*,spectators.*}` |
| features/rooms/components/GamesList.tsx:31-37 (`COLUMNS`) | Age, Description, Creator, Type, Restrictions, Players, Spectators | `GamesList.column.*` (mirror `UserGamesDialog.column.*`) |
| GamesList.tsx:149-308 (14) | `Games in`/`Showing` (fragment concatenation), empty-state sentence, Filter games, Clear filter, Create, Join, Spectate, Judge, Password required, Error | `GamesList.{heading,showing,empty,action.*,password.*}` — ICU, `<Trans>` for the sentence |
| features/rooms/components/RoomChat.tsx:98,104,136,151-152; features/player/PrivateChat.tsx:80,93,142,157-158 | `· room chat`/`· private chat`, `No messages yet — say hi.`, `Message {name}` placeholder, Send | `RoomChat.*`, `PrivateChat.*` |
| features/rooms/components/RoomUsers.tsx:39-48; features/server/ServerUsers.tsx:20-26 | Buddies, `{n} online`, Players Online, `{n} connected`, empty states | `RoomUsers.*`, `ServerUsers.*` (ICU `{count}`) |
| features/server/RoomsList.tsx:68-145 (10) | Rooms, available, column headers, No rooms available., Open, Join | `RoomsList.{title,available,column.*,empty,open,join}` (file already has `RoomsList.joinError`) |
| features/server/Server.tsx:84 | Server Announcements | `Server.announcements` |
| components/UserDisplay/UserActionsMenu.tsx:112-150 | Private chat, Add to/Remove from Buddy/Ignore List | `UserActionsMenu.*` (reuse from game `PlayerListContextMenu`) |
| components/CardDetails/CardDetails.tsx:34-96; TokenDetails/TokenDetails.tsx:25-52 | Name:, Cost:, CMC:, Identity:, Color(s):, Main Type:, Type:, Side:, Layout: | `CardDetails.label.*` (Token reuses) |
| components/CardRelatedLinks/CardRelatedLinks.tsx:164,191,210,254,276 | Other face, Token/Tokens, Meld, `Cards that use this token ({n})`, Related | `CardRelatedLinks.*` (ICU plural) |
| components/CountryDropdown/CountryDropdown.tsx:29,33,43 | Country ×2, None | **use orphaned `Common.label.country`**; add `Common.label.none` |
| components/Toast/Toast.tsx:109-110; dialogs/DialogShell/DialogShell.tsx:81-82; dialogs/PromptDialog/PromptDialog.tsx:86 | Dismiss, Close (title+aria), Cancel | `Common.action.{dismiss,close,cancel}` |
| components/UserBadges/UserBadges.tsx:50-61 | Admin, Moderator, Judge (title+aria) | `UserBadges.{admin,moderator,judge}` |
| feature-widgets/known-hosts/KnownHosts.tsx:225-226 | Edit host | `KnownHosts.edit` |
| feature-widgets/card-import/CardImportDialog.tsx:20; CardImportForm.tsx:173-175; useCardImportForm.ts:76 | Import Cards; Windows:/macOS:/Linux:; Failed to save imported data | `CardImportForm.{title,os.*,saveFailed}` |
| features/account/AddUserForm.tsx:43 | Add | `Account.addUser.submit` |
| features/reports/components/ReportUserContextPanel.tsx:72 | `by` (fragment) | one ICU message `Reports.context.byUser {user}` |
| features/logs/LogResults.tsx:110-112; reports/ReportQueue.tsx:74; reports/components/ReportStatsPanel.tsx:64,67 | `${t(..)} [${n}]`, `(${t(..)})` concatenation | move counts into ICU (`Logs.tab.rooms {count}`) |
| features/login/Login.tsx:68,129-142 | COCKATRICE, alt `Stock Player` ×3 | allowlist brand; `Login.showcase.avatarAlt` |
| rooms/components/GameSelector/*, OpenGames.tsx, SayMessage.tsx (~20) | only imported by specs (dead code) | delete rather than translate |

Leave literal: `index.tsx:23-25` debug banner, `LanguageNative` endonyms, `HostService` server names, `developer/serverStatsRows` units.

**TopBar status:** restack-21 translated only the Replays tab and the user menu (`UserMenu.i18n.json` via `userMenuEntries.ts`); ~25 TopBar literals listed above remain, several duplicating existing `UserMenu.*` strings. (There is no `useLeftNav.ts` any more — the matrix row's evidence path is stale.)

### 2.2 Game tree (`parity/17b-game-menus`, `05-refactor-seat`; decks on `23d-deck-share`)

| file:lines | string (count) | proposed key |
|---|---|---|
| features/game/components/PlayerBox/PlayerBox.tsx (115, grep only) | library/graveyard/exile menu labels (`Draw card`, `View top cards of library...`, `Move top cards to exile face down...`), White…Colorless, `Hand — {n} card(s)`, life-total aria-label, `Set {x} counter` | `PlayerBox.{zone.*,lifeAria}`; **dedupe menu labels into `PlayerMenu.*` first** |
| context-menus/PlayerContextMenu/playerMenu.model.ts:45-979 (91), PlayerContextMenu.tsx:35-37 | same zone menu labels, Tally, Total Power/Toughness, Custom Zones, `View custom zone '{name}'`, Say | `PlayerMenu.*` |
| context-menus/CardContextMenu/cardContextMenu.model.ts:145-253 (35), handCardMenu.model.ts:45-107 (18), revealedCardMenu.model.ts:22-26, CardContextMenu.tsx:109-177 (17), useCardContextMenu.ts:15-20, relatedCardActions.ts:30-169 | Tap/Untap, Turn Over, Move to → zones, P/T ±, `Add counter ({letter})`, `Token: …` | `CardMenu.*`; one shared `GameZone.{hand,library,graveyard,exile,battlefield,sideboard,stack}` |
| context-menus/ZoneContextMenu/ZoneContextMenu.tsx:70-168 (31), HandContextMenu/HandContextMenu.tsx:68-93 (15) | Draw N cards…, Shuffle top N…, Take mulligan, Sort hand by… | `ZoneMenu.*`, `HandMenu.*` |
| GameLobby.tsx:87-820 (37) | Loading game…, `Game #{id}`, Waiting for player…, Ready up, Force start, `Confirm — kick {n} unready player{s}` (plural by concatenation), Host controls, Kick | `GameLobby.*` with ICU plurals |
| Game.tsx:51-328 (10), hooks/useGameLifecycleNavigation.ts:12,16 | concede/unconcede/leave confirms, kicked/closed toasts | `Game.confirm.{concede,unconcede,leave}.*`, `Game.toast.{kicked,closed}` |
| components/PhaseTrack/PhaseTrack.tsx:67-288 (26) | 11 phase labels+titles, Turn phases, Pass | `PhaseTrack.phase.<id>.{label,title}` |
| components/BattlefieldSidebar/BattlefieldSidebar.tsx:341-655 (25), CardPreviewPopup/CardPreviewPopupPage.tsx:122-320 (11), PlayerBox/bigCardPreview.tsx:217 | Preview, Back to {name}, Hover a card…, Leave/Concede/Rejoin/Sideboard, `● Live` | `GameSidebar.*`, `CardPreview.*` |
| dialogs/CreateTokenDialog/* (27) | colours, field labels/arias, Name is required | `CreateTokenDialog.*`, `Common.validation.required` |
| dialogs/IncomingRevealDialog (23), ZoneViewDialog/ZoneViewPanel.tsx (20), ZoneRevealPanel.tsx, useZoneViewDialog.ts:44, zoneViewSort.ts:232-256 | duplicated Group by / Sort by option sets, pile view, search placeholder, `{Top/Bottom} {n}` | shared `ZoneView.{groupBy,sortBy,search}.*` |
| hooks/dialogs/seatPrompts.ts (19), useCardDialogActions.ts (9), useHandDialogActions.ts (7), useLibraryDialogActions.ts (16), useZoneDialogActions.ts, useGameArrowInteractions.ts:375 | prompt titles/labels, `Enter 0 or more`, `Enter a positive integer` | `GamePrompt.*`, `Common.validation.{integerMin,positiveInteger}` |
| dialogs/{SideboardDialog (16), DeckSelectDialog (10), MoveTopUntilDialog (8), RevealCardsDialog (11), RollDieDialog (~6), GameInfoDialog (11)} | titles, labels, Cancel/Apply/Close | one namespace per dialog + `Common.action.*` |
| right-sidebar/PlayerList/{PlayerListContextMenu,PlayerListDialogs,PlayerList}.tsx, PlayerInfoPanel.tsx, ChatLog/ChatLog.tsx:102-226, ChatLog/useGameLog.ts:67, SidebarResizer.tsx:102-118, ui/GameBoardCell/usePlayerSeatViewModel.ts:66,218 | buddy/ignore actions, Real name/Country/Account age, Conceded/Ready, Chat & log, `Player {id}` | `PlayerList.*` (reuse `UserActionsMenu.*`), `GameChat.*`, `Game.playerFallback` |

Excluded: `ui/GameBoardCell/GameBoardCell.tsx:39-93` MOCK_DECK card names; `arrowPath.ts` SVG paths.

| decks file:lines (23d) | string (count) | proposed key |
|---|---|---|
| dialogs/ImportDeckDialog.tsx (26), hooks/useDeckImportFlow.ts (5), deckImport.ts:67,81 | instructions, placeholder decklist, Looking up cards…, `.cod` errors, Imported deck | `ImportDeckDialog.*`, `Decks.import.error.*` |
| dialogs/CardDetailDialog.tsx (20), PrintingPickerDialog.tsx (8), hooks/useCardPrintings.ts:80 | Close, No image, CMC, Back to, Add to deck, Choose printing, Current | `CardDetailDialog.*`, `PrintingPicker.*` |
| components/search/CardSearchFilters.tsx (14), AdvancedCardSearch.tsx (11), hooks/useScryfallCardSearch.ts:42 | Colors, Includes/Exactly/At most, Types, `Showing {n} result(s)` concatenated, Search failed | `CardSearch.*` (ICU plural) |
| components/editor/{DeckRowActionsMenu (12), DeckEditorShells (12), DeckSidebar (9), DeckBuyButton (8), PlainCardList (7), QuickAddSearch, DeckMainPane, DeckCardPreview, DeckCardRow} | quantity/printing actions, Loading deck…, Deck not found, Untitled Deck, Saving…, Unsaved changes, `card(s)` | extend `DeckEditor.*` |
| components/breakdown/{DeckBreakdown (9), BracketSection (6), TypeBreakdown, ColorPie}, bracketBadges.ts, hooks/useBracketAssessment.ts:92 | Overview, Total/Nonland/Lands/Avg CMC, Mana curve, bracket text | `DeckBreakdown.*`, `Bracket.*` |
| components/list/{DeckListHeader (8), DeckListStates, DeckRow, DeckBadges}, deckTree.ts:74-80 (`{n}m ago`), hooks/useDeckList.ts:197 | `{n} deck(s) on the server` (ternary plural), Refresh, Import, No decks yet, Delete deck, New Deck | `Decks.list.*`; relative time via `Intl.RelativeTimeFormat(i18n.language)` |
| dialogs/{CreateDeckDialog, DeleteDeckDialog, ExportDeckDialog}, components/FormatPicker.tsx, deckSummary.ts:127 | dialog text, export format descriptions, Other (specify) | `CreateDeckDialog.*`, `DeleteDeckDialog.*`, `ExportDeckDialog.*`, `FormatPicker.*` |

Leave literal: `deckTags.ts` DEFAULT_DECK_TAGS (stored values matching desktop), `bracketData.ts` card names, `deckExport.ts` section headers (file format).

### 2.3 Key integrity (missing / orphan)

Literal `t('…')` / `i18nKey` keys vs merged leaf keys of all `*.i18n.json` (template keys `t(\`A.${x}\`)` matched by prefix):

| tree | catalog keys | literal keys | missing | orphans |
|---|---|---|---|---|
| restack-21 | 1221 | 652 | 2 | 5 |
| 17b | 832 | 408 | 2 | 6 |
| 05 | 818 | 406 | 2 | 6 |
| 23d | 1003 | 545 | 2 | 6 |

- **Bug (all trees):** `features/login/useLogin.ts:103` calls `t('Login.toasts.passwordResetSuccess')`; `Login.i18n.json:19` defines `passwordResetSuccessToast` — the toast renders the raw key. (Verified.) Fix: rename the JSON key.
- `features/logs/LogResults.tsx:108` `t('Logs.title', { defaultValue: 'Log Results' })` — key absent, hidden by `defaultValue`.
- Orphans: `Common.label.country` (CountryDropdown should use it), `KnownHostForm.help`, `ShortcutsTab.resetAll`, `Login.toasts.passwordResetSuccessToast`, `Settings.navLabel`; game trees also `Common.language`.
- `i18n-default.json` is in sync with sources in every tree.

### 2.4 Locales

- `public/locales/` has 12 folders (de, en_US, es, fi, fr, it, nl, pl, pt_BR, ru, tok, yue), each `translation.json` with **318 keys** vs 1221 source keys (restack-21). Transifex is pull-only and quarterly (`translations-pull.yml`), so coverage lags master by design; LONG-016's "expose only completeness-qualified catalogs" needs a completeness threshold computed from these files (follow-up, not in this audit's fix plan).
- restack-21 aligns locale ids (underscore folder codes, `toBcp47` for `Intl`). The game base still has `Language['en-US']` with 4 languages, so the backend requests `/locales/en-US/translation.json` (404, masked by the bundled resource). Resolved when the trees are joined — **watch the merge**.
- Stale `Common.languages.en-US` entry in every translated catalog after the rename (translations of that label lost until next Transifex round-trip).
- `__test-utils__/renderWithProviders.tsx` (~123) still uses `lng/fallbackLng: 'en-US'` — mismatches `DEFAULT_LANGUAGE = en_US` in restack-21.
- `toLocaleString()` without locale in `replays/LocalReplays.tsx:138`, `ServerReplays.tsx:30` follows the browser, not the chosen UI language.

### 2.5 CI check for missing keys — none today

`ci.yml` has typecheck/lint/test/integration/e2e jobs, none i18n-aware; no `eslint-plugin-i18next`; `prebuild.js` only throws on a **top-level** namespace collision (and does not `await` `outputFile`).

Proposal:

1. **`packages/webatrice/scripts/check-i18n.mjs`** → npm script `i18n:check`. Using the TS compiler API:
   - (a) every literal `t('X')` / `i18nKey="X"` resolves to a leaf in the merged catalog; `defaultValue` is rejected for in-catalog namespaces (it hides misses);
   - (b) every template key prefix `t(\`A.b.${…}\`)` matches ≥1 key;
   - (c) no orphan keys, with `i18n-allowlist.json` for keys reached via `labelKey`-style props;
   - (d) every English message parses with `intl-messageformat` (already a dependency);
   - (e) committed `src/i18n-default.json` equals a fresh merge (stale rollup fails);
   - (f) `public/locales/*` folders ⇔ `Language` enum values.
2. **ESLint:** `eslint-plugin-i18next` `i18next/no-literal-string` in `jsx-only` mode, `jsx-attributes.include: [title, aria-label, placeholder, label, helperText, alt]`, words excluded `Webatrice|COCKATRICE|TCGplayer|[^a-zA-Z]+`. Off for `**/*.spec.*`, `__test-utils__`, `features/developer`, and — until migrated — `features/{game,decks,rooms}/**`. `lint` runs `--max-warnings 0`, so the rule must be `error` on clean folders and `off` elsewhere (no `warn`); each migration PR deletes its folder from the off-list.
3. **Where:** `ci.yml` job `lint`, new step after "Webatrice lint": `run: npm run -w @cockatrice/webatrice i18n:check`. That job already runs the webatrice prebuild via `install-packages`.

## 3. Suggested fix split

The PRs are ordered so shared primitives land first. Each PR adds or extends co-located specs. jsdom plus `@testing-library/user-event` keyboard tests are enough for focus and keys. Contrast goes in `palettes.spec.ts`. Each PR also includes its i18n strings, so no new literals are introduced.

| PR | contents | rows | estimate |
|---|---|---|---|
| **A. `fix(a11y): shared dialog focus, menu primitive, live regions`** (platform tree) | `DialogShell` initial focus, trap and restore, plus `aria-labelledby`; move FilterGames and SequenceEdit onto it. Shared `Menu` primitive (focus-in, roving arrows, submenus, `menuitemcheckbox`, focus return, Shift+F10 opener hook), used by `UserActionsMenu` and the TopBar user menu. Persistent toast region with hover/focus pause. `role=log` on room and private chat. `<html lang>` follows the language, and `document.title` is set per route. Contrast tokens (on-accent text, form borders, `text-danger`) with `palettes.spec` assertions. | P4–P6, P8–P12, P14, P16, P18, contrast | L (~3 days) |
| **B. `fix(a11y): keyboard paths for platform lists and nav`** (platform tree) | `GamesList` on `useGridRows` with scroll-into-view and button sort headers. TopBar tabs become a `nav` with NavLinks. KnownHosts listbox. CardCallout focus. The P15 batch of names and alt text. VirtualList ARIA passthrough. Delete dead `GameSelector`/`OpenGames`/`SayMessage`. | P1–P3, P7, P13, P15, P17, P19 | M (~2 days) |
| **C. `fix(a11y): keyboard-operable game board`** (on the joined game tree, after 05) | **Land G1 first, as a small separate commit:** Tab guard plus the Shift+Tab → next-phase-action parity fix. Then: focusable cards and piles with `useGridRows`-style roving and state labels. Keyboard selection. Live menus moved onto PR A's primitive, deleting the losing menu stack. Life and mana controls. Arrow/attach target picker. `role=log` game log. Phase bar `aria-current` and focus-expand. Seat and zone landmarks. Focus ring utility. Game modals moved onto DialogShell. A restored keyboard-path integration spec in place of the deleted keyboard-sensor suite. | G1–G19 | XL. Split into **C1** (G1, G8, G9, G11–G18: ~2 days) and **C2** (G2–G7, G10, G19: cards, menus, picker, ~4–5 days) |
| **D. `feat(i18n): extract remaining literals + i18n CI gate`** | `scripts/check-i18n.mjs` + `i18n:check` in the `lint` job. `eslint-plugin-i18next` `no-literal-string` on clean folders. Fix the `passwordResetSuccess` key, `Logs.title`, and the orphans. `Common.action.*`. TopBar, rooms and components extraction (~120 strings). Then the per-folder follow-ups, each one removing its folder from the lint off-list: **D2** decks (~230, 1.5 days), **D3** game menus and dialogs (~670, of which ~200 are duplicates once `PlayerMenu`/`GameZone`/`ZoneView` are shared; 3 days, best after C2 settles the menu stack). Deck accessibility rows D1–D6 can ride along with D2. | §2, D1–D6 | D1: M (~1.5 days); D2: M; D3: L |

**Dependencies:**
- PR C needs PR A's menu primitive and DialogShell, and needs `useGridRows`. Both arrive when restack-21 is joined with the game chain.
- G1 has no dependencies. It is the cheapest high-impact fix and can go first in any tree.
- D3 should wait for C2 so that menu labels are extracted once.
