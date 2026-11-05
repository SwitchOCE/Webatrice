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
type ValueOperation<Value> = { token: Token; apply: (value: Value) => Value };
type MoveEntry = { kind: 'move'; operations: MoveOperation[]; cardId?: number };
type ValueEntry<Value = unknown> = {
  kind: 'value';
  confirmed: Value;
  operations: ValueOperation<Value>[];
  write: (value: Value) => void;
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

function displayedValue<Value>(entry: ValueEntry<Value>): Value {
  return entry.operations.reduce((value, operation) => operation.apply(value), entry.confirmed);
}

export function beginOptimisticValue<Value>(
  key: string,
  confirmed: Value,
  apply: (value: Value) => Value,
  write: (value: Value) => void,
): Token {
  const token = Symbol();
  const existing = pendingOps.get(key);
  const entry: ValueEntry<Value> = existing?.kind === 'value'
    ? existing as ValueEntry<Value>
    : { kind: 'value', confirmed, operations: [], write };
  entry.operations.push({ token, apply });
  pendingOps.set(key, entry as ValueEntry);
  entry.write(displayedValue(entry));
  return token;
}

export function confirmedOptimisticValue<Value = number>(key: string): Value | undefined {
  const entry = pendingOps.get(key);
  return entry?.kind === 'value' ? entry.confirmed as Value : undefined;
}

export function confirmOptimisticValue<Value>(key: string, value: Value): Value {
  const entry = pendingOps.get(key) as MoveEntry | ValueEntry<Value> | undefined;
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

export function rollbackOptimistic(token: Token): void {
  const match = [...pendingOps].find(([, entry]) => entry.operations.some(operation => operation.token === token));
  if (!match) {
    return;
  }
  const [key, entry] = match;
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
