import { refreshCardDataPreferences } from '@app/hooks';
import {
  CardDataSettingsDTO,
  CardSourceDTO,
  dexieService,
  enableAllUnknown,
  markAllAsKnown,
  reconcileSetPreferences,
  SetPreferenceDTO,
  type CardSource,
  type CardSourceKind,
  type CardSourceOrigin,
  type CardSourceRecords,
  type Info,
  type Set,
  type SetPreference,
  type Token,
} from '@app/services';

import { cockatriceXmlParser } from './CockatriceXmlParser';
import {
  CardSourceId,
  mergeCardSources,
  nextCustomOrder,
  sortSourcesByLoadOrder,
  sourceIdFor,
  sourceKindForFile,
} from './mergeCardSources';

/** Desktop's custom-token set (`CardSet::TOKENS_SETNAME`) as oracle writes it. */
export const CUSTOM_TOKEN_SET: Set = {
  name: { value: 'TK' },
  longname: { value: 'Dummy set containing tokens' },
  settype: { value: 'Tokens' },
};

export interface CardDatabaseSummary {
  cards: number;
  sets: number;
  tokens: number;
  formats: number;
}

export interface RebuildResult {
  summary: CardDatabaseSummary;
  /** Sets the user has not decided on yet (desktop's "New sets found" prompt). */
  unknownSets: string[];
  /** Desktop's first-run case: nothing was enabled, so every set was. */
  allNewSetsEnabled: boolean;
}

export interface NewSourceInput {
  fileName: string;
  xml: string;
  origin: CardSourceOrigin;
  url?: string;
  /** Defaults to the kind desktop infers from the file name. */
  kind?: CardSourceKind;
}

export type UnknownSetsAnswer = 'enable' | 'enable-always' | 'keep-disabled';

function countsOf(records: CardSourceRecords) {
  return {
    cards: records.cards.length,
    sets: records.sets.length,
    tokens: records.tokens.length,
    formats: records.formats.length,
  };
}

function parseRecords(xml: string): CardSourceRecords {
  const parsed = cockatriceXmlParser.parse(xml);
  return {
    cards: parsed.cards ?? [],
    sets: parsed.sets ?? [],
    tokens: parsed.tokens ?? [],
    formats: parsed.formats ?? [],
    info: parsed.info,
  };
}

/** Strips the stored XML so listings don't hold whole databases in memory. */
function withoutPayload(source: CardSource): CardSource {
  const { xml: _xml, records: _records, ...meta } = source;
  return meta;
}

/**
 * Owns the card database the way desktop's `CardDatabaseLoader` does: a list
 * of sources (files or URLs) folded in load order into the `cards` / `sets` /
 * `tokens` / `formats` tables. Every change re-derives those tables inside a
 * single transaction, so a bad file can never leave a half-written database.
 */
class CardDatabaseService {
  // Parsed sources reused across rebuilds in this session, keyed by id +
  // import time; the main cards.xml is large and rarely changes.
  private parsedCache = new Map<string, { importedAt: string; records: CardSourceRecords }>();

  /** Parse (and so validate) XML into a source row ready for `applySources`. */
  createSource(input: NewSourceInput, existing: readonly CardSource[]): CardSource {
    const kind = input.kind ?? sourceKindForFile(input.fileName);
    const order = kind === 'custom' ? nextCustomOrder(existing) : 0;
    const records = parseRecords(input.xml);
    const importedAt = new Date().toISOString();
    const id = sourceIdFor(kind, input.fileName, order);
    this.parsedCache.set(id, { importedAt, records });
    return {
      id,
      kind,
      fileName: input.fileName,
      origin: input.origin,
      url: input.url,
      order,
      importedAt,
      counts: countsOf(records),
      xml: input.xml,
      sourceVersion: records.info?.sourceVersion,
      author: records.info?.author,
      createdAt: records.info?.createdAt,
    };
  }

  /** Every source, in load order, without its payload. */
  async listSources(): Promise<CardSource[]> {
    const sources = await CardSourceDTO.getAll();
    return sortSourcesByLoadOrder(sources.map(withoutPayload));
  }

  /** Whether a source already holds exactly this file (desktop compares hashes). */
  async hasSourceXml(id: string, xml: string): Promise<boolean> {
    const source = await CardSourceDTO.get(id);
    return source?.xml === xml;
  }

  async summary(): Promise<CardDatabaseSummary> {
    const [cards, sets, tokens, formats] = await Promise.all([
      dexieService.cards.count(),
      dexieService.sets.count(),
      dexieService.tokens.count(),
      dexieService.formats.count(),
    ]);
    return { cards, sets, tokens, formats };
  }

  /** Parse and add files/downloads, replacing same-named sources, then rebuild. */
  async addSources(inputs: readonly NewSourceInput[]): Promise<RebuildResult> {
    const existing = await CardSourceDTO.getAll();
    const added: CardSource[] = [];
    for (const input of inputs) {
      added.push(this.createSource(input, [...existing, ...added]));
    }
    return this.applySources(added, []);
  }

  async removeSource(id: string): Promise<RebuildResult> {
    this.parsedCache.delete(id);
    return this.applySources([], [id]);
  }

  /** Desktop's "Reload card database": re-derive every table from the sources. */
  reload(): Promise<RebuildResult> {
    this.parsedCache.clear();
    return this.applySources([], []);
  }

  private recordsOf(source: CardSource): CardSourceRecords {
    if (source.records) {
      return source.records;
    }
    const cached = this.parsedCache.get(source.id);
    if (cached && cached.importedAt === source.importedAt) {
      return cached.records;
    }
    const records = parseRecords(source.xml ?? '');
    this.parsedCache.set(source.id, { importedAt: source.importedAt, records });
    return records;
  }

  private async applySources(added: readonly CardSource[], removedIds: readonly string[]): Promise<RebuildResult> {
    const [stored, preferences, settings] = await Promise.all([
      CardSourceDTO.getAll(),
      SetPreferenceDTO.getAll(),
      CardDataSettingsDTO.get(),
    ]);

    const replaced = new globalThis.Set<string>([...removedIds, ...added.map((s) => s.id)]);
    // A fresh cards.xml supersedes what a pre-v7 install imported.
    if (added.some((s) => s.kind === 'main')) {
      replaced.add(sourceIdFor('legacy', '', 0));
    }
    const sources = sortSourcesByLoadOrder([...stored.filter((s) => !replaced.has(s.id)), ...added]);

    // Parse before the transaction: IndexedDB commits a transaction that
    // waits on anything but its own requests.
    const merged = mergeCardSources(sources.map((s) => this.recordsOf(s)));
    const reconciliation = reconcileSetPreferences(
      merged.sets,
      new Map(preferences.map((p) => [p.code, p])),
      settings.alwaysEnableNewSets,
    );
    const mainSource = sources.find((s) => s.kind === 'main' || s.kind === 'legacy');
    const info: Info | undefined = merged.info && mainSource
      ? {
        ...merged.info,
        source: mainSource.origin === 'url' ? 'remote' : 'oracle-local-fs',
        sourceUrl: mainSource.url ?? merged.info.sourceUrl,
        importedAt: mainSource.importedAt,
      }
      : undefined;

    await dexieService.cardDataTransaction(async () => {
      await Promise.all([
        dexieService.cardSources.bulkDelete([...replaced]),
        dexieService.cards.clear(),
        dexieService.sets.clear(),
        dexieService.tokens.clear(),
        dexieService.formats.clear(),
        dexieService.info.clear(),
      ]);
      await Promise.all([
        dexieService.cardSources.bulkPut([...added]),
        dexieService.cards.bulkPut(merged.cards),
        dexieService.sets.bulkPut(merged.sets),
        dexieService.tokens.bulkPut(merged.tokens),
        dexieService.formats.bulkPut(merged.formats),
        info ? dexieService.info.put(info) : Promise.resolve(),
        dexieService.setPreferences.bulkPut(reconciliation.changed),
      ]);
    });

    await refreshCardDataPreferences();
    return {
      summary: countsOf(merged),
      unknownSets: reconciliation.unknownSets,
      allNewSetsEnabled: reconciliation.allNewSetsEnabled,
    };
  }

  /** Answer desktop's "New sets found" prompt. */
  async resolveUnknownSets(answer: UnknownSetsAnswer): Promise<void> {
    const [sets, preferences] = await Promise.all([
      dexieService.sets.toArray() as Promise<Set[]>,
      SetPreferenceDTO.getAll(),
    ]);
    const map = new Map(preferences.map((p) => [p.code, p]));
    const changed = answer === 'keep-disabled' ? markAllAsKnown(sets, map) : enableAllUnknown(sets, map);
    await SetPreferenceDTO.bulkPut(changed);
    if (answer === 'enable-always') {
      const settings = await CardDataSettingsDTO.get();
      settings.alwaysEnableNewSets = true;
      await settings.save();
    }
    await refreshCardDataPreferences();
  }

  async getSetInventory(): Promise<{ sets: Set[]; preferences: SetPreference[] }> {
    const [sets, preferences] = await Promise.all([
      dexieService.sets.toArray() as Promise<Set[]>,
      SetPreferenceDTO.getAll(),
    ]);
    return { sets, preferences };
  }

  /** Manage Sets "OK": persist the whole list (`SetsModel::save`). */
  async saveSetPreferences(preferences: readonly SetPreference[]): Promise<void> {
    await SetPreferenceDTO.bulkPut([...preferences]);
    await refreshCardDataPreferences();
  }

  async getPictureUrlTemplates(): Promise<string[]> {
    return (await CardDataSettingsDTO.get()).pictureUrlTemplates;
  }

  async savePictureUrlTemplates(templates: readonly string[]): Promise<void> {
    const settings = await CardDataSettingsDTO.get();
    settings.pictureUrlTemplates = [...templates];
    await settings.save();
    await refreshCardDataPreferences();
  }

  async recordUpdateCheck(at = new Date()): Promise<void> {
    const settings = await CardDataSettingsDTO.get();
    settings.lastUpdateCheck = at.toISOString();
    await settings.save();
  }

  async getLastUpdateCheck(): Promise<string | undefined> {
    return (await CardDataSettingsDTO.get()).lastUpdateCheck;
  }

  // ---- Custom tokens (dlg_edit_tokens) ----

  async getCustomTokens(): Promise<Token[]> {
    const source = await CardSourceDTO.get(CardSourceId.USER_TOKENS);
    return source?.records?.tokens ?? [];
  }

  /** True when a card or token with this name is already loaded. */
  async isNameTaken(name: string): Promise<boolean> {
    const [card, token] = await Promise.all([
      dexieService.cards.where('name.value').equalsIgnoreCase(name).first(),
      dexieService.tokens.where('name.value').equalsIgnoreCase(name).first(),
    ]);
    return Boolean(card || token);
  }

  /**
   * Replace the editor-token source. Editor tokens load last and never share
   * a name with another card (the editor refuses that), so writing them
   * straight into `tokens` gives the same result as a full rebuild.
   */
  async saveCustomTokens(tokens: readonly Token[], removedNames: readonly string[] = []): Promise<void> {
    const sets = tokens.length ? [CUSTOM_TOKEN_SET] : [];
    const records: CardSourceRecords = { cards: [], sets, tokens: [...tokens], formats: [] };
    const source: CardSource = {
      id: CardSourceId.USER_TOKENS,
      kind: 'user-tokens',
      fileName: 'TK.xml',
      origin: 'editor',
      order: 0,
      importedAt: new Date().toISOString(),
      counts: countsOf(records),
      records,
    };
    await dexieService.cardDataTransaction(async () => {
      await dexieService.tokens.bulkDelete([...removedNames]);
      await dexieService.tokens.bulkPut([...tokens]);
      if (tokens.length && !(await dexieService.sets.get(CUSTOM_TOKEN_SET.name.value))) {
        await dexieService.sets.put(CUSTOM_TOKEN_SET);
      }
      await dexieService.cardSources.put(source);
    });
  }
}

export const cardDatabaseService = new CardDatabaseService();
