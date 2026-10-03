# PLAT / LONG gaps re-verified against upstream e477701 (2026-10-03)

W = packages/webatrice/src, S = packages/sockatrice/src, D = packages/datatrice/src

REL-001: reconnect now ends honestly ("Connection lost — please log in again") but no re-auth / room+game rejoin.
REL-002 / PLAT-004: ProtobufService pendingCommands has no timeout; resetCommands() clears without rejecting.

| ID | Missing now | Size |
|---|---|---|
| PLAT-002 | Vendored proto 2026-05-08; Cockatrice master adds reports, mod tools, playmats, developer role, deck share, RespPasswordChangeRequired=38 | M |
| PLAT-003 | clientConfig.ts clientver 'webclient-1.0 (2019-10-31)' | S |
| PLAT-006 | no session resume | M-L |
| PLAT-008 | D stores notifications + serverShutdown; no selector, no W consumer | S |
| PLAT-010 | no public server list fetch | M |
| PLAT-012 | activation doesn't carry password -> login(undefined) (useLogin.ts:202, SignalContexts PendingActivationContext) | S |
| PLAT-013 | login.ts no server-full / password-change-required mapping | S |
| PLAT-014/LONG-019 | Account.tsx:76-78 Edit/Password/Avatar buttons inert; S+D exist | M |
| PLAT-015 | UserMenu lacks Account/Settings/Logs/Replays/Admin; useLeftNav orphaned | S |
| PLAT-017 | RoomsList.tsx:93 ignores privilegelevel | S |
| PLAT-018 | joinRoom.ts no onError/response map/UI feedback | S |
| PLAT-021 | room chat: no flood handling, no ignore filter, no timestamps | M |
| PLAT-022 | message.ts no error/ignore/flood/draft handling | S-M |
| PLAT-023 | no Notification API | S |
| PLAT-025/LONG-022 | getGamesOfUser in S+D, 0 W call sites | M |
| PLAT-027 | no ErrorBoundary | S |
| PLAT-028 | CI lint job skips webatrice (3548 problems; 3300 are indent/quotes/curly autofixable; 3 boundaries, 11 exhaustive-deps, 11 unused) | S-M |
| LONG-001..004 | Replays: no route/screen; S+D support for list/download/delete/modify/getCode/submitCode exists; no player/timeline; no .cor import | L |
| LONG-005 | Local/offline game | L (out of scope?) |
| LONG-006 | useLogs.ts MAXIMUM_RESULTS=1000 hardcoded; no time window | S |
| LONG-007 | debug log viewer | S-M |
| LONG-008/010/011/012/013/014/015 | Settings only shortcuts. No preferences, chat prefs/macros, theme/light, sound, notification prefs, storage/cache | L |
| LONG-016 | Language enum 4 of 12 locales; en_US vs en-US mismatch | M |
| LONG-017 | Game.dragdrop.spec keyboard suite describe.skip | M |
| LONG-023 | Report user + my reports: missing all layers + proto | L |
| LONG-024 | Warn/ban only on Player page; histories/notes/adjustMod only in game PlayerList; getWarnList never requested | M |
| LONG-025 | Report queue/case mgmt: missing all layers + proto | L |
| LONG-026 | Alts/sessions/last logins/reset pw/remove avatar: missing all layers + proto | L |
| LONG-027 | No Administration route; S+D for updateServerMessage/shutdown/reloadConfig/adjustMod exist | M |
| LONG-028..030 | card data mgmt: reload, custom sets/cards/tokens, art prefs | M-L |
| LONG-031/032/033 | updates/plugins/desktop integration: divergent by platform | - |

## Mod/admin command coverage (S/D/W, vendored?)
BanFromServer yyy; GetBanHistory yy PlayerList-only; Warn yyy; GetWarnHistory yy PlayerList-only; GetWarnList yy no-UI;
ViewLogHistory yyy; GrantReplayAccess yy no-UI; ForceActivateUser yy no-UI; Get/UpdateAdminNotes yy PlayerList-only;
NOT VENDORED (need proto bump): CardArtRules 1010-1012, GetUserSessions 1013, GetUserAlts 1014, GetModeratorLastLogins 1015,
ResetUserPassword 1016 (mod+admin), RemoveUserAvatar 1017, ReportList/Assign/Resolve/UserInfo/Stats 1200-1205,
ReplayDownloadByGameId 1203; Session Report 1200/ReportMyList 1204/ReportAddComment 1205/ReportDetails 1206; SetCardArtParams 1025;
Game SetPlaymat 1035; Event_NotifyUser REPORT_RESOLVED=5/REPORT_COMMENT=6; Event_GameLogNotice 2022.
Admin UpdateServerMessage/Shutdown/ReloadConfig yy no-UI; AdjustMod yy PlayerList-only.

Cockatrice protocol changes since vendored pin: #7091 reports+moderation queue (2026-08-21), #7101 playmats, #7153 RTT,
#7211 developer staff role, #7212 live metrics developer tab, #7241 deck share links + public decks.
Latest Cockatrice: 3.1.0-beta.15 (2026-09-27). Servatrice docker images on ghcr only for stable releases (3.0.0) -> build locally.
