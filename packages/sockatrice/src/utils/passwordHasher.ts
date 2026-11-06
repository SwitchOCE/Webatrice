import { Event_ServerIdentification_ServerOptions } from '../generated';
import { sha512 } from '@noble/hashes/sha2.js';

const HASH_ROUNDS = 1_000;
const SALT_LENGTH = 16;

export const hashPassword = async (salt: string, password: string): Promise<string> => {
  let bytes: Uint8Array<ArrayBuffer> = new TextEncoder().encode(salt + password);
  const subtle = globalThis.crypto?.subtle;
  for (let i = 0; i < HASH_ROUNDS; i++) {
    bytes = subtle ? new Uint8Array(await subtle.digest('SHA-512', bytes)) : new Uint8Array(sha512(bytes));
  }

  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return salt + btoa(binary);
};

export const passwordHashAvailable = (): boolean =>
  typeof globalThis.crypto?.subtle?.digest === 'function';

export const generateSalt = (): string => {
  const characters = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

  const bytes = new Uint8Array(SALT_LENGTH);
  crypto.getRandomValues(bytes);

  let salt = '';
  for (let i = 0; i < SALT_LENGTH; i++) {
    salt += characters.charAt(bytes[i] % characters.length);
  }

  return salt;
};

export const passwordSaltSupported = (serverOptions: number): boolean => {
  // Servatrice ServerOptions is a bitmask. See .github/instructions/sockatrice.instructions.md#protocol-version-and-feature-flags.
  return (serverOptions & Event_ServerIdentification_ServerOptions.SupportsPasswordHash) !== 0;
};
