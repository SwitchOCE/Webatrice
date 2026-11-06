import { isFieldSet } from '@bufbuild/protobuf';
import { hmac } from '@noble/hashes/hmac.js';
import { scryptAsync } from '@noble/hashes/scrypt.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { Response_PasswordSaltSchema, type Response_PasswordSalt } from '../generated';
import { hashPassword } from './passwordHasher';

const DEFAULT_COST = { n: 32768, r: 8, p: 1 };
const encode = (bytes: Uint8Array): string => btoa(String.fromCharCode(...bytes));
const decode = (value: string): Uint8Array => Uint8Array.from(atob(value), (c) => c.charCodeAt(0));

export class PasswordRequiredError extends Error {}

export function costParamsAreSane(n: number, r: number, p: number): boolean {
  return Number.isInteger(n) && n >= 1024 && n <= 2 ** 20 && (n & (n - 1)) === 0
    && Number.isInteger(r) && r >= 1 && r <= 32 && Number.isInteger(p) && p >= 1 && p <= 16;
}

export async function deriveScryptKey(password: string, salt: Uint8Array, n: number, r: number, p: number): Promise<Uint8Array> {
  if (!costParamsAreSane(n, r, p)) {
    throw new Error('Login failed: the server requested unsafe password parameters');
  }
  return scryptAsync(new TextEncoder().encode(password), salt, {
    N: n, r, p, dkLen: 64, maxmem: 128 * n * r + 128 * r * p + 4096,
  });
}

const formatVerifier = (salt: string, key: Uint8Array, n: number, r: number, p: number): string =>
  `$scrypt$${n}$${r}$${p}$${salt}$${encode(key)}`;

export async function generatePasswordVerifier(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const { n, r, p } = DEFAULT_COST;
  return formatVerifier(encode(salt), await deriveScryptKey(password, salt, n, r, p), n, r, p);
}

function parseVerifier(stored: string): Uint8Array | undefined {
  const parts = stored.split('$');
  if (parts.length !== 7 || parts[1] !== 'scrypt' || !costParamsAreSane(Number(parts[2]), Number(parts[3]), Number(parts[4]))) {
    return;
  }
  try {
    const key = decode(parts[6]);
    return decode(parts[5]).length && key.length === 64 ? key : undefined;
  } catch {
    return;
  }
}

export function challengeResponse(key: Uint8Array, nonce: Uint8Array): string {
  return `$challenge$${encode(nonce)}$${encode(hmac(sha256, key, nonce))}`;
}

export async function prepareChallengeLogin(
  salt: Response_PasswordSalt,
  password?: string,
  stored?: string,
): Promise<{ hashedPassword: string; credential: string }> {
  const storedKey = stored ? parseVerifier(stored) : undefined;
  let key: Uint8Array;
  let credential: string;
  if (salt.needsMigration) {
    if (storedKey) {
      throw new Error('Login failed: the server requested weaker authentication for a saved verifier');
    }
    if (!password && (!stored || stored.startsWith('$'))) {
      throw new PasswordRequiredError('Login failed: please enter your password to sign in again');
    }
    credential = password ? await hashPassword(salt.passwordSalt, password) : stored!;
    key = new TextEncoder().encode(credential);
  } else if (password) {
    const n = isFieldSet(salt, Response_PasswordSaltSchema.field.n) ? salt.n : DEFAULT_COST.n;
    const r = isFieldSet(salt, Response_PasswordSaltSchema.field.r) ? salt.r : DEFAULT_COST.r;
    const p = isFieldSet(salt, Response_PasswordSaltSchema.field.p) ? salt.p : DEFAULT_COST.p;
    const scryptSalt = isFieldSet(salt, Response_PasswordSaltSchema.field.scryptSalt) ? salt.scryptSalt : salt.passwordSalt;
    key = await deriveScryptKey(password, decode(scryptSalt), n, r, p);
    credential = formatVerifier(scryptSalt, key, n, r, p);
  } else if (storedKey) {
    key = storedKey;
    credential = stored!;
  } else {
    throw new PasswordRequiredError('Login failed: please enter your password to sign in again');
  }
  return { hashedPassword: challengeResponse(key, salt.nonce), credential };
}
