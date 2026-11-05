type Overrides = Record<string, string[]>;

export function changedBindings(previous: Overrides, next: Overrides): string[] {
  return [...new Set([...Object.keys(previous), ...Object.keys(next)])].filter((id) => {
    const before = previous[id];
    const after = next[id];
    return before !== after && !(before && after && before.length === after.length
      && before.every((sequence, index) => sequence === after[index]));
  });
}
