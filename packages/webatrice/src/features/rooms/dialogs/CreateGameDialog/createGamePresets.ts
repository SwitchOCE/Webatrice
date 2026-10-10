import type { CreateGameParams } from '@cockatrice/sockatrice/generated';

export const DEFAULT_MAX_PLAYERS = 2;
export const DEFAULT_STARTING_LIFE = 20;
export const MAX_PLAYERS_RANGE = { min: 1, max: 100 } as const;
export const STARTING_LIFE_RANGE = { min: 1, max: 99999 } as const;

export interface CreateGameForm {
  description: string;
  password: string;
  maxPlayers: number;
  onlyBuddies: boolean;
  onlyRegistered: boolean;
  spectatorsAllowed: boolean;
  spectatorsNeedPassword: boolean;
  spectatorsCanTalk: boolean;
  spectatorsSeeEverything: boolean;
  joinAsSpectator: boolean;
  startingLifeTotal: number;
  shareDecklistsOnLoad: boolean;
  joinAsJudge: boolean;
  gameTypeId: number | null;
}

export type PresetId = 'commanderPod' | 'oneVsOne' | 'casualOpen' | 'friendsOnly';

type PresetFields = Partial<Omit<CreateGameForm, 'description' | 'password' | 'gameTypeId' | 'joinAsJudge'>>;

export interface CreateGamePreset {
  id: PresetId;
  fields: PresetFields;
  format: 'commander' | 'any' | 'keep';
  needsRegistration: boolean;
}

const OPEN_TABLE: PresetFields = {
  onlyRegistered: true,
  onlyBuddies: false,
  spectatorsAllowed: true,
  spectatorsCanTalk: false,
  spectatorsSeeEverything: false,
  shareDecklistsOnLoad: false,
};

export const CREATE_GAME_PRESETS: readonly CreateGamePreset[] = [
  {
    id: 'commanderPod',
    fields: { ...OPEN_TABLE, maxPlayers: 4, startingLifeTotal: 40 },
    format: 'commander',
    needsRegistration: false,
  },
  {
    id: 'oneVsOne',
    fields: { ...OPEN_TABLE, maxPlayers: 2, startingLifeTotal: 20 },
    format: 'any',
    needsRegistration: false,
  },
  {
    id: 'casualOpen',
    fields: {
      maxPlayers: 4,
      onlyRegistered: false,
      onlyBuddies: false,
      spectatorsAllowed: true,
      spectatorsCanTalk: true,
      shareDecklistsOnLoad: false,
    },
    format: 'any',
    needsRegistration: false,
  },
  {
    id: 'friendsOnly',
    fields: { onlyBuddies: true, spectatorsAllowed: false, spectatorsCanTalk: false },
    format: 'keep',
    needsRegistration: true,
  },
];

export const DEFAULT_PRESET_ID: PresetId = 'oneVsOne';

export function defaultCreateGameForm(isRegistered: boolean): CreateGameForm {
  return {
    description: '',
    password: '',
    maxPlayers: DEFAULT_MAX_PLAYERS,
    onlyBuddies: false,
    onlyRegistered: isRegistered,
    spectatorsAllowed: true,
    spectatorsNeedPassword: false,
    spectatorsCanTalk: false,
    spectatorsSeeEverything: false,
    joinAsSpectator: false,
    startingLifeTotal: DEFAULT_STARTING_LIFE,
    shareDecklistsOnLoad: false,
    joinAsJudge: false,
    gameTypeId: null,
  };
}

const COMMANDER_NAMES = new Set(['commander', 'edh']);

export function findCommanderGameType(gametypeMap: Record<number, string>): number | null {
  const entries = Object.entries(gametypeMap).map(([id, name]) => ({ id: Number(id), name: name.trim().toLowerCase() }));
  const exact = entries.find(({ name }) => COMMANDER_NAMES.has(name));
  if (exact) {
    return exact.id;
  }
  const word = entries.find(({ name }) => name.split(/[^a-z]+/).some((part) => COMMANDER_NAMES.has(part)));
  return word ? word.id : null;
}

export function findGameTypeByName(gametypeMap: Record<number, string>, name: string | null): number | null {
  if (!name) {
    return null;
  }
  const match = Object.entries(gametypeMap).find(([, typeName]) => typeName === name);
  return match ? Number(match[0]) : null;
}

export function presetFields(preset: CreateGamePreset, isRegistered: boolean): PresetFields {
  if (isRegistered) {
    return preset.fields;
  }
  const fields = { ...preset.fields };
  if (fields.onlyRegistered !== undefined) {
    fields.onlyRegistered = false;
  }
  if (fields.onlyBuddies !== undefined) {
    fields.onlyBuddies = false;
  }
  return fields;
}

export function isPresetAvailable(preset: CreateGamePreset, isRegistered: boolean): boolean {
  return isRegistered || !preset.needsRegistration;
}

export function applyPreset(
  form: CreateGameForm,
  preset: CreateGamePreset,
  ctx: { gametypeMap: Record<number, string>; isRegistered: boolean },
): CreateGameForm {
  const next: CreateGameForm = { ...form, ...presetFields(preset, ctx.isRegistered) };
  if (preset.format === 'commander') {
    next.gameTypeId = findCommanderGameType(ctx.gametypeMap);
  } else if (preset.format === 'any') {
    next.gameTypeId = null;
  }
  return next;
}

export function matchingPreset(form: CreateGameForm, isRegistered: boolean): PresetId | null {
  const match = CREATE_GAME_PRESETS.find(
    (preset) =>
      isPresetAvailable(preset, isRegistered) &&
      Object.entries(presetFields(preset, isRegistered)).every(
        ([key, value]) => form[key as keyof PresetFields] === value,
      ),
  );
  return match ? match.id : null;
}

export function toCreateGameParams(form: CreateGameForm, isJudge: boolean): CreateGameParams {
  return {
    description: form.description,
    password: form.password,
    maxPlayers: form.maxPlayers,
    onlyBuddies: form.onlyBuddies,
    onlyRegistered: form.onlyRegistered,
    spectatorsAllowed: form.spectatorsAllowed,
    spectatorsNeedPassword: form.spectatorsAllowed && form.spectatorsNeedPassword,
    spectatorsCanTalk: form.spectatorsAllowed && form.spectatorsCanTalk,
    spectatorsSeeEverything: form.spectatorsAllowed && form.spectatorsSeeEverything,
    gameTypeIds: form.gameTypeId != null ? [form.gameTypeId] : [],
    joinAsJudge: isJudge && form.joinAsJudge,
    joinAsSpectator: form.joinAsSpectator,
    startingLifeTotal: form.startingLifeTotal,
    shareDecklistsOnLoad: form.shareDecklistsOnLoad,
  };
}

export type SummaryAudience = 'buddies' | 'registered' | 'anyone';

export interface CreateGameSummary {
  seats: number;
  audience: SummaryAudience;
  hasPassword: boolean;
  life: number;
  format: string | null;
  spectators: { canTalk: boolean; seeEverything: boolean; needPassword: boolean } | null;
  shareDecklists: boolean;
  hostWatches: boolean;
  hostJudges: boolean;
}

export function summarizeCreateGame(
  form: CreateGameForm,
  ctx: { gametypeMap: Record<number, string>; isJudge: boolean },
): CreateGameSummary {
  return {
    seats: form.maxPlayers,
    audience: form.onlyBuddies ? 'buddies' : form.onlyRegistered ? 'registered' : 'anyone',
    hasPassword: form.password !== '',
    life: form.startingLifeTotal,
    format: form.gameTypeId != null ? (ctx.gametypeMap[form.gameTypeId] ?? null) : null,
    spectators: form.spectatorsAllowed
      ? {
        canTalk: form.spectatorsCanTalk,
        seeEverything: form.spectatorsSeeEverything,
        needPassword: form.spectatorsNeedPassword,
      }
      : null,
    shareDecklists: form.shareDecklistsOnLoad,
    hostWatches: form.joinAsSpectator,
    hostJudges: ctx.isJudge && form.joinAsJudge,
  };
}

export function advancedSettingCount(isJudge: boolean): number {
  return isJudge ? 11 : 10;
}
