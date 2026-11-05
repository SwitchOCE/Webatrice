type Token = symbol;
type MoveOperation = { token: Token; rollback: () => void; destination: string };
type ValueOperation = { token: Token; apply: (value: number) => number };
type MoveEntry = { kind: 'move'; operations: MoveOperation[] };
type ValueEntry = {
  kind: 'value';
  confirmed: number;
  operations: ValueOperation[];
  write: (value: number) => void;
};

const pendingOps = new Map<string, MoveEntry | ValueEntry>();

export function beginOptimistic(key: string, rollback: () => void, destination: string): Token {
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

export function consumeOptimistic(key: string, destination: string): 'none' | 'pending' | 'confirmed' | 'remote' {
  const entry = pendingOps.get(key);
  if (entry?.kind !== 'move') {
    return 'none';
  }
  if (entry.operations[0].destination !== destination) {
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
  const entry = pendingOps.get(key);
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
      operation.rollback();
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
