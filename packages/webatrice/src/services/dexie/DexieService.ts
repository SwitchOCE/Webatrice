import Dexie from 'dexie';

import { schemaV1 } from './DexieSchemas/v1.schema';
import { Stores, schemaV2 } from './DexieSchemas/v2.schema';
import { schemaV6 } from './DexieSchemas/v6.schema';

class DexieService {
  private db: Dexie = new Dexie('Webatrice');

  constructor() {
    schemaV1(this.db);
    schemaV2(this.db);
    schemaV6(this.db);
  }

  get settings() {
    return this.db.table(Stores.SETTINGS);
  }

  get cards() {
    return this.db.table(Stores.CARDS);
  }

  get sets() {
    return this.db.table(Stores.SETS);
  }

  get tokens() {
    return this.db.table(Stores.TOKENS);
  }

  get hosts() {
    return this.db.table(Stores.HOSTS);
  }

  get formats() {
    return this.db.table(Stores.FORMATS);
  }

  get info() {
    return this.db.table(Stores.INFO);
  }

  // Scryfall read-through cache. Persisted so a Scryfall response
  // survives a page reload — see the note on Stores.SCRYFALL_CACHE.
  get scryfallCache() {
    return this.db.table(Stores.SCRYFALL_CACHE);
  }

  /** Row count of one table. */
  count(store: Stores): Promise<number> {
    return this.db.table(store).count();
  }

  /** Empties the given tables in one transaction, so a failure leaves every one of them intact. */
  async clear(stores: readonly Stores[]): Promise<void> {
    const tables = stores.map((store) => this.db.table(store));
    await this.db.transaction('rw', tables, () => Promise.all(tables.map((table) => table.clear())));
  }

  testConnection() {
    return this.db.open();
  }
}

export const dexieService = new DexieService();
