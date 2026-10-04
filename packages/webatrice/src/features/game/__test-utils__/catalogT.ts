import type { TFunction } from 'i18next';

/**
 * A `t` that reads English messages from the given `*.i18n.json` catalogues and
 * fills in their {placeholders}, for specs of pure text builders. (Rendered
 * specs use the test i18n instance, which answers with the key.)
 */
export function catalogT(...catalogs: object[]): TFunction {
  const merged = Object.assign({}, ...catalogs) as Record<string, unknown>;
  return ((key: string, params: Record<string, unknown> = {}) => {
    const message = key.split('.').reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], merged);
    if (typeof message !== 'string') {
      throw new Error(`No English message for ${key}`);
    }
    return message.replace(/\{(\w+)\}/g, (_, name: string) => String(params[name]));
  }) as unknown as TFunction;
}
