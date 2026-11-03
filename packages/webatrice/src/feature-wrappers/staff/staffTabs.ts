export function staffTabIds(prefix: string, value: string): { tab: string; panel: string } {
  return { tab: `${prefix}-tab-${value}`, panel: `${prefix}-panel` };
}
