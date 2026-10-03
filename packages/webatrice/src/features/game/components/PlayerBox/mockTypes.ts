/**
 * Local mock types for the ported fancy-webatrice PlayerBox.
 *
 * Fancy's PlayerBox reads from Supabase-backed types (`RoomMemberWithProfile`
 * from `@/lib/rooms`). Og doesn't have those types — its data flows through Cockatrice protobuf via Redux.
 *
 * Rather than rewrite the whole PlayerBox to use Cockatrice types
 * (which is the future wiring work), we define the minimal shape of
 * what fancy actually reads. This lets us keep the port ~1:1 with
 * fancy's source while the wiring lives on placeholder mocks.
 *
 * Every field here is exactly what fancy's PlayerBox
 * accesses on the Supabase rows. Anything unused was dropped.
 */

/** Room member + attached profile — exactly the fields PlayerBox
 *  reads on the incoming `player` prop. */
export interface RoomMemberWithProfile {
  user_id: string;
  profile: {
    id: string;
    display_name: string | null;
    username: string | null;
    avatar_url: string | null;
  } | null;
}
