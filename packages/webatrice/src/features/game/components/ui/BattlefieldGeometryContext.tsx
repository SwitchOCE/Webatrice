import { createContext, useContext, useEffect } from 'react';

/**
 * A battlefield's drop grid as its board lays it out (useBattlefieldLayout):
 * the grid a drop on it resolves against, and how many columns each wire row
 * can reach across the shared drop surface, including its blank space.
 */
export interface BattlefieldGeometry {
  rows: number;
  cols: number;
  /** Columns a drop can reach in each row, by wire row. */
  colsByWireRow: readonly number[];
}

export interface BattlefieldGeometryRegistry {
  set(playerId: number, geometry: BattlefieldGeometry): void;
  delete(playerId: number): void;
  get(playerId: number): BattlefieldGeometry | undefined;
}

/** One registry per game: each battlefield publishes its grid, and the
 *  keyboard move (MoveCardsDialog) reads the grid a drop would use. */
export function createBattlefieldGeometryRegistry(): BattlefieldGeometryRegistry {
  const map = new Map<number, BattlefieldGeometry>();
  return {
    set: (playerId, geometry) => map.set(playerId, geometry),
    delete: (playerId) => map.delete(playerId),
    get: (playerId) => map.get(playerId),
  };
}

export const BattlefieldGeometryContext = createContext<BattlefieldGeometryRegistry | null>(null);

export function useBattlefieldGeometryRegistry(): BattlefieldGeometryRegistry | null {
  return useContext(BattlefieldGeometryContext);
}

/** Publishes a battlefield's grid while it is on the board. */
export function usePublishBattlefieldGeometry(playerId: number, geometry: BattlefieldGeometry): void {
  const registry = useBattlefieldGeometryRegistry();
  const { rows, cols, colsByWireRow } = geometry;
  const byRow = colsByWireRow.join(',');
  useEffect(() => {
    if (!registry) {
      return undefined;
    }
    registry.set(playerId, { rows, cols, colsByWireRow: byRow.split(',').map(Number) });
    return () => registry.delete(playerId);
  }, [registry, playerId, rows, cols, byRow]);
}
