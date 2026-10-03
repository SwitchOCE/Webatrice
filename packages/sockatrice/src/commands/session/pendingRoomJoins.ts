// Room joins in flight, by room id, valued by whether a user asked for the room
// (desktop TabServer::pendingRoomJoins). Every command settles (answered, timed
// out, or failed on disconnect), so an entry never outlives its join. Kept out of
// the session-commands barrel so it doesn't surface on `request.session`.
export const pendingRoomJoins = new Map<number, boolean>();

/** Test hook: forget joins whose command a mocked transport never settled. */
export function _resetPendingRoomJoins(): void {
  pendingRoomJoins.clear();
}
