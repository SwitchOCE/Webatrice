import { create } from '@bufbuild/protobuf';
import { createHmac, scryptSync } from 'node:crypto';
import { Response_PasswordSaltSchema } from '../generated';
import { challengeResponse, costParamsAreSane, deriveScryptKey, prepareChallengeLogin } from './passwordChallenge';

const saltBytes = Buffer.from('000102030405060708090a0b0c0d0e0f', 'hex');
const nonce = Uint8Array.from(Buffer.from('ff80000102030405060708090a0b0c0d0e0f', 'hex'));
const password = 'päss🔑word';
const expectedKey = scryptSync(password, saltBytes, 64, { N: 1024, r: 8, p: 2 });
const expectedHmac = createHmac('sha256', expectedKey).update(nonce).digest('base64');
const expectedResponse = `$challenge$${Buffer.from(nonce).toString('base64')}$${expectedHmac}`;

it('derives the independent node:crypto scrypt known answer from raw salt bytes and UTF-8 password', async () => {
  expect(Buffer.from(await deriveScryptKey(password, Uint8Array.from(saltBytes), 1024, 8, 2))).toEqual(expectedKey);
});

it('matches an independent HMAC-SHA256 known answer, including both base64 fields', () => {
  expect(challengeResponse(Uint8Array.from(expectedKey), nonce)).toBe(expectedResponse);
});

it('uses explicit scrypt salt rather than the legacy backup salt and retains a reusable verifier', async () => {
  const result = await prepareChallengeLogin(create(Response_PasswordSaltSchema, {
    passwordSalt: 'backupLegacySalt', scryptSalt: saltBytes.toString('base64'), n: 1024, r: 8, p: 2, nonce,
  }), password);
  expect(result).toEqual({
    hashedPassword: expectedResponse,
    credential: `$scrypt$1024$8$2$${saltBytes.toString('base64')}$${expectedKey.toString('base64')}`,
  });
});

it('falls back to password_salt when scrypt_salt is absent', async () => {
  const result = await prepareChallengeLogin(create(Response_PasswordSaltSchema, {
    passwordSalt: saltBytes.toString('base64'), n: 1024, r: 8, p: 2, nonce,
  }), password);
  expect(result.hashedPassword).toBe(expectedResponse);
});

it('uses desktop defaults for absent cost fields', async () => {
  const key = scryptSync(password, saltBytes, 64, { N: 32768, r: 8, p: 1, maxmem: 40 * 1024 * 1024 });
  const result = await prepareChallengeLogin(create(Response_PasswordSaltSchema, {
    passwordSalt: saltBytes.toString('base64'), nonce,
  }), password);
  expect(result.credential).toBe(`$scrypt$32768$8$1$${saltBytes.toString('base64')}$${key.toString('base64')}`);
});

it.each([
  [0, 8, 1], [512, 8, 1], [1025, 8, 1], [2 ** 21, 8, 1],
  [1024, 0, 1], [1024, 33, 1], [1024, 8, 0], [1024, 8, 17], [1024, 1.5, 1],
])('refuses unsafe cost parameters (%s, %s, %s) before derivation', async (n, r, p) => {
  expect(costParamsAreSane(n, r, p)).toBe(false);
  await expect(deriveScryptKey(password, saltBytes, n, r, p)).rejects.toThrow('unsafe password parameters');
});

it('accepts both desktop parameter boundaries', () => {
  expect(costParamsAreSane(1024, 1, 1)).toBe(true);
  expect(costParamsAreSane(2 ** 20, 32, 16)).toBe(true);
});

it('refuses explicit zero costs rather than silently substituting defaults', async () => {
  await expect(prepareChallengeLogin(create(Response_PasswordSaltSchema, {
    passwordSalt: saltBytes.toString('base64'), n: 0, r: 8, p: 1, nonce,
  }), password)).rejects.toThrow('unsafe password parameters');
});
