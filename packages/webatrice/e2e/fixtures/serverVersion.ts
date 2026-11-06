import type { ServerCapability } from '@cockatrice/datatrice';

export function serverHas(capability: ServerCapability): boolean {
  const capabilities = process.env.SERVATRICE_CAPABILITIES;
  if (capabilities === undefined) {
    throw new Error('Global setup must record the server capabilities before specs load');
  }
  return capabilities.split(',').includes(capability);
}
