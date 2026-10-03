/** RevealCardsDialog's "All players" choice (desktop's default recipient). */
export const ALL_PLAYERS = -1;

/**
 * Command_RevealCards addressing for a dialog choice. "All players" OMITS
 * player_id: it is proto2 `optional sint32 [default = -1]`, protobuf-es puts
 * an explicitly set -1 on the wire, and Servatrice answers any present
 * player_id that names no player with RespNameNotFound
 * (server_abstract_player.cpp cmdRevealCards, `has_player_id()`).
 */
export function revealRecipient(targetPlayerId: number): { playerId?: number } {
  return targetPlayerId === ALL_PLAYERS ? {} : { playerId: targetPlayerId };
}
