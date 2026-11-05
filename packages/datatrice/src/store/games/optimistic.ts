import type { ServerInfo_Card } from '@cockatrice/sockatrice/generated';

type Token = symbol;
type MoveDestination = { playerId: number; zoneName: string };
type MoveConfirmation = Pick<ServerInfo_Card, 'id' | 'x' | 'y' | 'faceDown' | 'name' | 'providerId'>;
type MoveOperation = {
  token: Token;
  rollback: (confirmed?: Partial<MoveConfirmation>) => void;
  destination: MoveDestination;
  confirmed?: MoveConfirmation;
};
type ValueOperation = { token: Token; apply: (value: number) => number };
type MoveEntry = { kind: 'move'; operations: MoveOperation[]; cardId?: number };
type ValueEntry = {
  kind: 'value';
  confirmed: number;
  operations: ValueOperation[];
  write: (value: number) => void;
};

const pendingOps = new Map<string, MoveEntry | ValueEntry>();

export function beginOptimistic(key: string, rollback: MoveOperation['rollback'], destination: MoveDestination): Token {
  const token = Symbol();
  const existing = pendingOps.get(key);
  const entry: MoveEntry = existing?.kind === 'move' ? existing : { kind: 'move', operations: [] };
  entry.operations.push({ token, rollback, destination });
  pendingOps.set(key, entry);
  return token;
}

export function isOptimisticPending(key: string): boolean {
  return pendingOps.has(key);
}

export function consumeOptimistic(key: string, destination: MoveDestination): 'none' | 'pending' | 'confirmed' | 'remote' {
  const entry = pendingOps.get(key);
  if (entry?.kind !== 'move') {
    return 'none';
  }
  const expected = entry.operations[0].destination;
  if (expected.playerId !== destination.playerId || expected.zoneName !== destination.zoneName) {
    pendingOps.delete(key);
    return 'remote';
  }
  entry.operations.shift();
  if (entry.operations.length) {
    return 'pending';
  }
  pendingOps.delete(key);
  return 'confirmed';
}

export function reconcileOptimisticMove(key: string, newKey: string, card: ServerInfo_Card): void {
  const entry = pendingOps.get(key);
  if (entry?.kind !== 'move') {
    return;
  }
  const { id, x, y, faceDown, name, providerId } = card;
  entry.cardId = id;
  entry.operations[0].confirmed = { id, x, y, faceDown, name, providerId };
  if (key !== newKey) {
    pendingOps.delete(key);
    pendingOps.set(newKey, entry);
  }
}

function displayedValue(entry: ValueEntry): number {
  return entry.operations.reduce((value, operation) => operation.apply(value), entry.confirmed);
}

export function beginOptimisticValue(
  key: string,
  confirmed: number,
  apply: (value: number) => number,
  write: (value: number) => void,
): Token {
  const token = Symbol();
  const existing = pendingOps.get(key);
  const entry: ValueEntry = existing?.kind === 'value'
    ? existing
    : { kind: 'value', confirmed, operations: [], write };
  entry.operations.push({ token, apply });
  pendingOps.set(key, entry);
  entry.write(displayedValue(entry));
  return token;
}

export function confirmedOptimisticValue(key: string): number | undefined {
  const entry = pendingOps.get(key);
  return entry?.kind === 'value' ? entry.confirmed : undefined;
}

export function confirmOptimisticValue(key: string, value: number): number {
  const entry = pendingOps.get(key);
  if (entry?.kind !== 'value') {
    return value;
  }
  entry.confirmed = value;
  entry.operations.shift();
  const displayed = displayedValue(entry);
  if (!entry.operations.length) {
    pendingOps.delete(key);
  }
  return displayed;
}

export function rollbackOptimistic(key: string, token: Token): void {
  let entry = pendingOps.get(key);
  if (!entry?.operations.some(operation => operation.token === token)) {
    for (const [candidateKey, candidate] of pendingOps) {
      if (candidate.operations.some(operation => operation.token === token)) {
        key = candidateKey;
        entry = candidate;
        break;
      }
    }
  }
  if (!entry) {
    return;
  }
  const index = entry.operations.findIndex(operation => operation.token === token);
  if (index < 0) {
    return;
  }
  if (entry.kind === 'value') {
    entry.operations.splice(index, 1);
    if (!entry.operations.length) {
      pendingOps.delete(key);
    }
    entry.write(displayedValue(entry));
  } else {
    const removed = entry.operations.splice(index);
    if (!entry.operations.length) {
      pendingOps.delete(key);
    }
    for (const operation of removed.reverse()) {
      operation.rollback({ ...operation.confirmed, ...(entry.cardId === undefined ? {} : { id: entry.cardId }) });
    }
  }
}

export function clearOptimistic(gameId?: number): void {
  if (gameId === undefined) {
    pendingOps.clear();
    return;
  }
  for (const key of pendingOps.keys()) {
    if (key.startsWith(`${gameId}:`)) {
      pendingOps.delete(key);
    }
  }
}

export function moveOpKey(gameId: number, sourcePlayerId: number, cardId: number): string {
  return `${gameId}:move:${sourcePlayerId}:${cardId}`;
}

export function attrOpKey(gameId: number, playerId: number, cardId: number, attribute: string | number): string {
  return `${gameId}:attr:${playerId}:${cardId}:${attribute}`;
}

export function counterOpKey(gameId: number, playerId: number, counterId: number): string {
  return `${gameId}:counter:${playerId}:${counterId}`;
}
