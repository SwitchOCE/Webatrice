// Canonical wire values for a card zone's name (ServerInfo_Card / ServerInfo_Zone
// `name`). Server-defined and stable — these are the Cockatrice protocol zone
// strings, so they live in the protocol layer and every consumer imports them
// from here.
export const ZoneName = {
  TABLE: 'table',
  GRAVE: 'grave',
  EXILE: 'rfg',
  HAND: 'hand',
  DECK: 'deck',
  SIDEBOARD: 'sb',
  STACK: 'stack',
} as const;

export type ZoneNameValue = (typeof ZoneName)[keyof typeof ZoneName];

const BUILTIN_ZONES: ReadonlySet<string> = new Set(Object.values(ZoneName));

/**
 * Whether `name` is one of the seven zones every Servatrice player has. A
 * server may add more (desktop's custom zones, player_logic.cpp:98-170); no
 * stock Servatrice does.
 */
export function isBuiltinZone(name: string): name is ZoneNameValue {
  return BUILTIN_ZONES.has(name);
}
