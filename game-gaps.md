# GAME gaps re-verified against upstream e477701 (2026-10-03)

All 16 open rows still open.

| ID | Missing (layer) | Cockatrice ref | Size |
|---|---|---|---|
| GAME-002 | UI: folder tree create/delete/move, upload to path. Sockatrice deckNewDir/deckDelDir + datatrice reducers exist. Decks.tsx flattenFolder | tab_deck_storage.cpp | L |
| GAME-004 | Legality per row + summary (format, allowedCounts) | deck_list_model.cpp isCardQuantityLegalForFormat, deck_list_style_proxy.cpp | M |
| GAME-005 | Deck editor undo/redo + history | deck_state_manager.cpp, deck_list_history_manager_widget.cpp | M |
| GAME-006 | Banner card + tags editor (bannerCard/tagsXml passthrough only) | deck_editor_deck_dock_widget.cpp, deck_preview_widget.cpp | M |
| GAME-007 | Sample hand | visual_deck_editor_sample_hand_widget.cpp | S |
| GAME-009 | Load from website, decklist export, Deckstats/TappedOut analyze, print | deck_editor_menu.cpp | M |
| GAME-013 | GameLobby.handleForceStart loops kickFromGame; must send one readyStart {ready:true, forceStart:true} | deck_view_container.cpp forceStart | S |
| GAME-014 | Sideboard plan/lock in pre-game lobby (SideboardDialog only on started board) | deck_view_container.cpp | M |
| GAME-018 | Pile-view Select All / Select Column have no onClick (LibrarySearchDialog selection internal) | card_menu.cpp | S-M |
| GAME-021 | Open game deck in editor matches by name only | library_menu.cpp aOpenDeckInDeckEditor | M |
| GAME-023 | Custom zones menu/view (disabled placeholder) | custom_zone_menu.cpp | M |
| GAME-027 | Tally (subtypes / total power) | tally_menu.cpp | M |
| GAME-028 | Next phase with action | tab_game.cpp actNextPhaseAction | S |
| GAME-029 | Reverse turn UI (cmd+reducer exist) | tab_game.cpp | S |
| GAME-030 | Rotate view CW/CCW | tab_game.cpp actRotateViewCW/CCW | S-M |
| GAME-033 | Invite to game / copy game link | tab_game.cpp L516-563, DlgInviteToGame | M |

Extra gaps: card "Reveal to..." (all/one player); "Hide"; "View related cards" placeholder; Say macros (say_menu.cpp + settings);
Remove local arrows only hard-coded Ctrl+R; reset layout (N/A); many shortcut keys absent in feature-widgets/shortcuts/defaults.ts
(aTap, aPlay, aPlayFacedown, move-to-*, flow P/T, view hand, sort hand, reveal hand, draw bottom, move top/bottom variants,
shuffle top/bottom, view exile, six-colour counters, rotate, next phase action, reverse turn).
