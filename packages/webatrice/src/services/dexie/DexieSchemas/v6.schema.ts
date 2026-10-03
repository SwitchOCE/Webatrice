import Dexie from 'dexie';

import { migrateSetting } from '../settingsMigration';
import { Stores } from './v2.schema';

// Version 6 versions the settings row: existing rows (auto-connect, inverted coordinates and
// shortcut overrides) are kept and run through every `migrateSetting` step, which backfills the
// Settings page's preferences with their desktop defaults, keeps upgraders on the dark palette
// and adopts a language they picked before it was a setting. Non-indexed fields, so the store spec
// is unchanged.
// Version 5 belongs to the replays cache (replays and replayData tables). Merge order: the replays
// change must land before this one. A user already at 6 never runs a later version(5) upgrade, so
// replays landing second would leave them without its tables.
export const schemaV6 = (db: Dexie) => {
  db.version(6)
    .stores({})
    .upgrade((tx) => tx.table(Stores.SETTINGS).toCollection().modify((row) => {
      migrateSetting(row);
    }));
};
