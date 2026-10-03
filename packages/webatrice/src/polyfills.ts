// @critical Must be imported before any module that can JSON-stringify Redux state
// (BigInt proto fields throw without toJSON). See .github/instructions/webatrice.instructions.md#initialization-order.
// Guarded so a browser without BigInt reaches the unsupported-browser screen
// (index.tsx) instead of throwing here.
if (typeof BigInt === 'function') {
  (BigInt.prototype as unknown as { toJSON: () => string }).toJSON = function bigIntToJSON() {
    return this.toString();
  };
}

export {};
