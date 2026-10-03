/**
 * Per-set user options, kept apart from the imported `sets` rows so a
 * re-import never resets them. Mirrors desktop's `ICardSetPriorityController`
 * `SetOptions`, persisted per short name in `cardDatabase.ini`.
 */
export class SetPreference {
  code: string;
  /** Art priority; lower wins. Rewritten 1..n on every Manage Sets save. */
  sortKey: number;
  enabled: boolean;
  /** False until the user has been asked about this set once. */
  isKnown: boolean;
}
